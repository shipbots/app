import { NextRequest, NextResponse } from 'next/server';
import { fetchClientInfo } from '@/lib/monday';
import { fetchTranscriptText } from '@/lib/fireflies';
import { EXTRACT_FIELDS, EXTRACT_OPTION_COLUMN_IDS, kindToValueType } from '@/lib/client-extract-fields';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CLIENTS_BOARD_ID = '7846251224';
const MONDAY_API_URL = 'https://api.monday.com/v2';
const MAX_TRANSCRIPT_CHARS = 120_000;
/** Sentinel that separates streamed keepalive bytes from the final JSON payload. */
const RESULT_MARKER = '\n__RESULT__';

/** Allowed option labels for the status/dropdown target columns (Clients board). */
async function fetchOptions(): Promise<Record<string, string[]>> {
  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) return {};
  const query = `query { boards(ids: [${CLIENTS_BOARD_ID}]) { columns { id type settings_str } } }`;
  try {
    const res = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: apiKey, 'API-Version': '2024-10' },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });
    const data = await res.json();
    const cols: Array<{ id: string; type: string; settings_str: string }> = data?.data?.boards?.[0]?.columns || [];
    const want = new Set(EXTRACT_OPTION_COLUMN_IDS);
    const out: Record<string, string[]> = {};
    for (const col of cols) {
      if (!want.has(col.id)) continue;
      try {
        const settings = JSON.parse(col.settings_str || '{}');
        if (col.type === 'color' || col.type === 'status') {
          const labels = Object.values((settings.labels || {}) as Record<string, string>).filter(
            (l): l is string => typeof l === 'string' && l.trim().length > 0,
          );
          if (labels.length) out[col.id] = labels;
        } else if (col.type === 'dropdown') {
          const labels = ((settings.labels || []) as Array<{ name: string }>).map((l) => l.name).filter(Boolean);
          if (labels.length) out[col.id] = labels;
        }
      } catch {
        /* skip malformed */
      }
    }
    return out;
  } catch {
    return {};
  }
}

const SYSTEM_PROMPT = `You are an assistant for a 3PL (ShipBots) onboarding team. You read the transcript of an onboarding / discovery call and extract concrete facts about the client's fulfillment operation to fill their CRM ("Client Info") fields.

Rules:
- Only propose a field when the transcript gives CLEAR evidence. Never guess, infer loosely, or invent values. It is better to omit a field than to fill it speculatively.
- For status/dropdown fields, the value MUST be exactly one of that field's allowed options (given in the field list). If nothing fits, omit the field.
- For free-text and notes fields that already have a CURRENT value, MERGE rather than replace: preserve the existing text and add the new details from the call, returning the full combined text. For empty fields, write a concise, specific value.
- Write values in clear, client-appropriate phrasing (these populate an internal CRM). Keep each value focused.
- Only return fields where your proposed value differs from the current value.
Return everything through the propose_client_info_updates tool.`;

/** Map + validate the model's raw updates into enriched proposals. */
function enrich(
  rawUpdates: Array<{ field?: string; value?: string; reasoning?: string }>,
  info: Record<string, unknown>,
  options: Record<string, string[]>,
) {
  const byKey = new Map(EXTRACT_FIELDS.map((f) => [String(f.key), f]));
  const proposals = [];
  for (const u of rawUpdates) {
    const f = byKey.get(String(u.field));
    if (!f) continue;
    let value = String(u.value ?? '').trim();
    if (!value) continue;
    const opts = options[f.columnId];
    if ((f.kind === 'status' || f.kind === 'dropdown') && opts?.length) {
      const match = opts.find((o) => o.toLowerCase() === value.toLowerCase());
      if (!match) continue; // don't invent labels
      value = match;
    }
    const current = String(info[f.key as string] ?? '').trim();
    if (value === current) continue;
    proposals.push({
      key: String(f.key),
      columnId: f.columnId,
      label: f.label,
      section: f.section,
      kind: f.kind,
      valueType: kindToValueType(f.kind),
      current,
      suggested: value,
      isNew: current.length === 0,
      reasoning: String(u.reasoning ?? '').trim(),
      options: opts ?? undefined,
    });
  }
  return proposals;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const anthropicKey = process.env.SHIPBOTS_ANTHROPIC_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'AI is not configured (SHIPBOTS_ANTHROPIC_KEY missing).' }, { status: 503 });
  }

  let transcriptId = '';
  try {
    transcriptId = String((await req.json())?.transcriptId || '').trim();
  } catch {
    /* ignore */
  }
  if (!transcriptId) return NextResponse.json({ error: 'Missing transcriptId' }, { status: 400 });

  const [info, transcript, options] = await Promise.all([
    fetchClientInfo(id).catch(() => null),
    fetchTranscriptText(transcriptId),
    fetchOptions(),
  ]);
  if (!info) return NextResponse.json({ error: 'Could not load this client record.' }, { status: 502 });

  const body = (transcript?.text || '').trim() || (transcript?.summary || '').trim();
  if (!body) {
    return NextResponse.json({ updates: [], note: 'No transcript content is available for this meeting.' });
  }
  const infoRec = info as unknown as Record<string, unknown>;

  const fieldLines = EXTRACT_FIELDS.map((f) => {
    const current = String(infoRec[f.key as string] ?? '').trim();
    const opts = options[f.columnId];
    const optStr = opts?.length ? ` | options: ${opts.join(', ')}` : '';
    return `- ${f.key} | ${f.label} | ${f.kind} | current: ${current ? JSON.stringify(current) : '(empty)'}${optStr}`;
  }).join('\n');

  const userContent = `CLIENT: ${info.name}

Fill the client-info fields below from the meeting transcript. Format is: key | label | type | current value (+ allowed options for status/dropdown).

FIELDS:
${fieldLines}

MEETING TRANSCRIPT (may include a summary if the word-for-word transcript is unavailable):
${body.slice(0, MAX_TRANSCRIPT_CHARS)}`;

  const tool = {
    name: 'propose_client_info_updates',
    description: 'Propose values for the client-info fields that the meeting transcript supports.',
    input_schema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', enum: EXTRACT_FIELDS.map((f) => f.key) },
              value: { type: 'string', description: 'Value to set. For status/dropdown it must be exactly one allowed option.' },
              reasoning: { type: 'string', description: 'Brief evidence from the transcript (max ~15 words).' },
            },
            required: ['field', 'value'],
          },
        },
      },
      required: ['updates'],
    },
  };

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true, // stream so the platform doesn't kill a long non-streaming request
      system: SYSTEM_PROMPT,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'propose_client_info_updates' },
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!anthropicRes.ok || !anthropicRes.body) {
    const err = await anthropicRes.text().catch(() => '');
    console.error('[extract-from-meeting] Anthropic error:', err);
    return NextResponse.json({ error: 'AI request failed.' }, { status: 502 });
  }

  // Stream keepalive bytes while the model works, then append the enriched
  // result JSON after RESULT_MARKER. The client reads to EOF and parses it.
  const reader = anthropicRes.body.getReader();
  const decoder = new TextDecoder();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = '';
      let jsonBuf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const evt = JSON.parse(raw);
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
                jsonBuf += evt.delta.partial_json || '';
              }
            } catch {
              /* skip malformed */
            }
          }
          controller.enqueue(enc.encode(' ')); // keepalive per chunk
        }
      } catch (e) {
        console.error('[extract-from-meeting] stream error:', e);
      }

      let rawUpdates: Array<{ field?: string; value?: string; reasoning?: string }> = [];
      try {
        rawUpdates = (JSON.parse(jsonBuf || '{}').updates ?? []) as typeof rawUpdates;
      } catch {
        /* leave empty */
      }
      const payload = { updates: enrich(rawUpdates, infoRec, options), meetingTitle: transcript?.title || '' };
      controller.enqueue(enc.encode(RESULT_MARKER + JSON.stringify(payload)));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
