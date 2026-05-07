import { GmailThread } from './types';

const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ─── Auth — uses refresh token exactly like /api/gmail/send ──────────────────
async function getFreshAccessToken(): Promise<string> {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw Object.assign(new Error('gmail_not_connected'), { code: 'gmail_not_connected' });
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }).toString(),
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

// ─── Thin Gmail API wrapper ───────────────────────────────────────────────────
// params values can be a string OR an array of strings (for repeated params like metadataHeaders)
async function gmailFetch(
  accessToken: string,
  endpoint: string,
  params?: Record<string, string | string[]>
) {
  const url = new URL(`${GMAIL_API_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        v.forEach(val => url.searchParams.append(k, val));
      } else {
        url.searchParams.append(k, v);
      }
    });
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API ${res.status}: ${body}`);
  }
  return res.json();
}

// ─── Main search function ─────────────────────────────────────────────────────
export async function searchEmailsByClient(
  clientName: string,
  contactEmails: string[] = []
): Promise<GmailThread[]> {
  let accessToken: string;
  try {
    accessToken = await getFreshAccessToken();
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'gmail_not_connected') return [];
    throw err;
  }

  // Build a comprehensive Gmail search query:
  //   - exact phrases for the client name
  //   - from:/to: for every known contact email
  const parts: string[] = [];

  // Name — wrap multi-word names in quotes for exact match
  const namePart = clientName.includes(' ')
    ? `"${clientName}"`
    : clientName;
  parts.push(namePart);

  // Each contact email — to: and from:
  for (const email of contactEmails.filter(Boolean)) {
    parts.push(`from:${email}`);
    parts.push(`to:${email}`);
  }

  const query = parts.join(' OR ');

  // Let 401/403 auth errors propagate so the API route can surface 'gmail_reauth_required'
  const listData = await gmailFetch(accessToken, '/threads', {
    q: query,
    maxResults: '20',
  });

  const threadList: { id: string; snippet: string }[] = listData.threads ?? [];
  if (threadList.length === 0) return [];

  // Fetch metadata for each thread (capped at 15 to keep it fast)
  const threads: GmailThread[] = [];

  await Promise.all(
    threadList.slice(0, 15).map(async t => {
      try {
        const thread = await gmailFetch(accessToken, `/threads/${t.id}`, {
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'To', 'Date'],
        });

        const messages: { id: string; labelIds?: string[]; payload?: { headers?: { name: string; value: string }[] }; snippet?: string }[] =
          thread.messages ?? [];
        if (messages.length === 0) return;

        // Use the first message headers for subject/from/to, last message for date
        const firstHeaders = messages[0].payload?.headers ?? [];
        const lastHeaders  = messages[messages.length - 1].payload?.headers ?? [];

        const header = (hdrs: { name: string; value: string }[], name: string) =>
          hdrs.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

        // Determine folder from labelIds on the first message
        const firstLabels = messages[0].labelIds ?? [];
        const folder: GmailThread['folder'] =
          firstLabels.includes('SENT')  ? 'sent'  :
          firstLabels.includes('INBOX') ? 'inbox' : 'other';

        threads.push({
          id:           messages[0].id,
          threadId:     t.id,
          subject:      header(firstHeaders, 'Subject') || '(no subject)',
          from:         header(firstHeaders, 'From'),
          to:           header(firstHeaders, 'To'),
          date:         header(lastHeaders,  'Date'),
          snippet:      messages[messages.length - 1].snippet ?? t.snippet ?? '',
          messageCount: messages.length,
          folder,
        });
      } catch {
        /* skip individual thread failures */
      }
    })
  );

  // Sort newest first
  return threads.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });
}

// ─── Decode a Gmail message body (handles plain-text + multipart) ─────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPlainText(payload: any): string {
  if (!payload) return '';
  // Direct body (non-multipart)
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  // Multipart: prefer text/plain, fall back to text/html stripped of tags
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64url').toString('utf-8');
      }
    }
    // Second pass: try nested multipart
    for (const part of payload.parts) {
      const nested = extractPlainText(part);
      if (nested) return nested;
    }
    // Last resort: strip HTML from text/html part
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64url').toString('utf-8');
        return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
      }
    }
  }
  return '';
}

export async function fetchMessageBody(messageId: string): Promise<string> {
  const accessToken = await getFreshAccessToken();
  const msg = await gmailFetch(accessToken, `/messages/${messageId}`, { format: 'full' });
  return extractPlainText(msg.payload) || msg.snippet || '';
}
