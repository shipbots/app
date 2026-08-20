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

/**
 * Search Fireflies transcripts by multiple terms in parallel (client name,
 * legal entity name, contact name, contact emails, etc.) and deduplicate by ID.
 */
export async function searchMeetingsByClient(
  searchTerms: string[],
): Promise<FirefliesMeeting[]> {
  const gqlQuery = `query ($title: String) {
    transcripts(title: $title, limit: 20) { ${TRANSCRIPT_FIELDS} }
  }`;

  const unique = [...new Set(searchTerms.filter(Boolean).map(s => s.trim()).filter(s => s.length > 2))];
  if (unique.length === 0) return [];

  try {
    const results = await Promise.allSettled(
      unique.map(term => firefliesQuery(gqlQuery, { title: term }))
    );

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
