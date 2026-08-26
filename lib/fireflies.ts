import { FirefliesMeeting } from './types';

const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql';

function getApiKey(): string {
  const key = process.env.FIREFLIES_API_KEY;
  if (!key) throw new Error('FIREFLIES_API_KEY not set in environment');
  return key;
}

async function firefliesQuery(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(FIREFLIES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) {
    console.error('Fireflies API error:', data.errors);
    throw new Error(data.errors[0]?.message || 'Fireflies API error');
  }
  return data.data;
}

const TRANSCRIPT_FIELDS = `
  id title date duration participants transcript_url video_url
  summary { overview action_items }
`;

function mapTranscript(t: {
  id: string;
  title: string;
  date: number;
  duration: number;
  participants: string[];
  transcript_url?: string;
  video_url?: string;
  summary?: { overview?: string; action_items?: string[] };
}): FirefliesMeeting {
  return {
    id: t.id,
    title: t.title,
    date: t.date ? new Date(t.date).toISOString() : '',
    duration: t.duration || 0,
    participants: t.participants || [],
    url: t.transcript_url || `https://app.fireflies.ai/view/${t.id}`,
    videoUrl: t.video_url || undefined,
    summary: t.summary?.overview || undefined,
    actionItems: t.summary?.action_items
      ? String(t.summary.action_items).split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0 && !s.startsWith('**'))
      : undefined,
  };
}

/**
 * Fetch the full word-for-word transcript (plus summary) for one meeting by id.
 * Used to feed Claude the real conversation, not just the overview. Falls back
 * to the summary text when sentence-level transcript isn't available on the plan.
 */
export async function fetchTranscriptText(
  id: string,
): Promise<{ title: string; text: string; summary: string } | null> {
  const query = `query ($id: String!) {
    transcript(id: $id) {
      title
      summary { overview action_items }
      sentences { speaker_name text }
    }
  }`;
  try {
    const data = await firefliesQuery(query, { id });
    const t = data?.transcript;
    if (!t) return null;
    const sentences: Array<{ speaker_name?: string; text?: string }> = t.sentences ?? [];
    const text = sentences
      .map((s) => `${(s.speaker_name || 'Speaker').trim()}: ${(s.text || '').trim()}`)
      .filter((l) => l.length > 2)
      .join('\n');
    const summary = [t.summary?.overview, t.summary?.action_items ? `Action items:\n${t.summary.action_items}` : '']
      .filter(Boolean)
      .join('\n\n');
    return { title: t.title || '', text, summary };
  } catch (error) {
    console.error('Fireflies transcript fetch error:', error);
    return null;
  }
}

// Drop common business-name suffix words to get the distinctive brand token, so
// a meeting titled "Shipbots x Solbari …" matches a client named "Solbari Shop".
function coreBrand(name: string): string {
  return (name || '')
    .replace(/[.,]/g, ' ')
    .replace(/\b(the|inc|llc|ltd|limited|pty|co|corp|corporation|company|group|holdings|store|shop|shopify|brand|brands|apparel|clothing|studio|studios|collective|goods|supply|supplies|official)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find a client's Fireflies meetings by (a) title terms — client name, legal
 * entity, contact name, plus a "core brand" variant with business suffixes
 * stripped — and (b) participant emails (the most reliable signal: a meeting
 * where the client's contact actually attended, whatever its title). Runs all
 * lookups in parallel and dedupes by transcript id.
 */
export async function searchMeetingsByClient(
  searchTerms: string[],
  emails: string[] = [],
): Promise<FirefliesMeeting[]> {
  const titleQuery = `query ($title: String) {
    transcripts(title: $title, limit: 20) { ${TRANSCRIPT_FIELDS} }
  }`;
  const emailQuery = `query ($email: String) {
    transcripts(participant_email: $email, limit: 20) { ${TRANSCRIPT_FIELDS} }
  }`;

  const titleTerms = new Set<string>();
  for (const raw of searchTerms) {
    const s = (raw || '').trim();
    if (s.length > 2) titleTerms.add(s);
    const core = coreBrand(s);
    if (core.length > 2 && core.toLowerCase() !== s.toLowerCase()) titleTerms.add(core);
  }
  const emailTerms = [...new Set(emails.map(e => (e || '').trim().toLowerCase()).filter(e => e.includes('@')))];

  if (titleTerms.size === 0 && emailTerms.length === 0) return [];

  try {
    const results = await Promise.allSettled([
      ...[...titleTerms].map(term => firefliesQuery(titleQuery, { title: term })),
      ...emailTerms.map(email => firefliesQuery(emailQuery, { email })),
    ]);

    const seen = new Set<string>();
    const merged: FirefliesMeeting[] = [];

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const t of (r.value?.transcripts ?? [])) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          merged.push(mapTranscript(t));
        }
      }
    }

    // Sort newest first
    return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error('Fireflies search error:', error);
    return [];
  }
}
