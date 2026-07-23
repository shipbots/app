/**
 * Match an ACH record (from the "Client Billing Info" board) to the right
 * client on the Clients board, cross-referencing the company + signer names
 * against each client's legal entity, business names, and contacts.
 *
 * A deterministic pre-filter narrows the ~hundreds of clients to a short,
 * relevant candidate list; Claude then picks the single best match (or none),
 * which handles LLC/Inc variations, typos, and nicknames the pre-filter can't.
 */

export interface ClientCandidate {
  id: string;
  name: string;
  legalEntity: string;
  quickbooks: string;
  shipHeroName: string;
  contactNames: string[]; // Person of Contact 1 / 2 / 3
}

export interface AchRecord {
  company: string;
  firstName: string;
  lastName: string;
}

export interface AchMatch {
  clientId: string;
  clientName: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

// Drop common company suffixes / punctuation so "SabersPro LLC" ~ "SabersPro".
const SUFFIX = /\b(llc|l\.?l\.?c|inc|incorporated|corp|corporation|co|ltd|limited|company|group|holdings)\b/gi;

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[.,'"&/()-]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}
function toks(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter(Boolean));
}
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits / Math.max(a.size, b.size);
}

// Cheap similarity so we send Claude a short, relevant candidate list. Company
// name is weighted higher than the signer name (a company match is stronger).
function preScore(c: ClientCandidate, rec: AchRecord): number {
  const company = toks(rec.company);
  const companyScore = Math.max(
    overlap(company, toks(c.name)),
    overlap(company, toks(c.legalEntity)),
    overlap(company, toks(c.quickbooks)),
    overlap(company, toks(c.shipHeroName)),
  );
  const signer = toks(`${rec.firstName} ${rec.lastName}`);
  const nameScore = Math.max(0, ...c.contactNames.map(n => overlap(signer, toks(n))));
  return companyScore * 2 + nameScore;
}

/**
 * Returns the best client match, or null when nothing is a confident match.
 * Throws only if the AI key is missing or the API errors.
 */
export async function matchClientForACH(rec: AchRecord, clients: ClientCandidate[]): Promise<AchMatch | null> {
  const ranked = clients
    .map(c => ({ c, s: preScore(c, rec) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map(x => x.c);
  if (ranked.length === 0) return null;

  const anthropicKey = process.env.SHIPBOTS_ANTHROPIC_KEY;
  if (!anthropicKey) throw new Error('SHIPBOTS_ANTHROPIC_KEY not configured');

  const candidates = ranked
    .map((c, i) =>
      `${i + 1}. id=${c.id} | name="${c.name}" | legalEntity="${c.legalEntity}" | quickbooks="${c.quickbooks}" | shipHero="${c.shipHeroName}" | contacts=[${c.contactNames.filter(Boolean).join('; ')}]`,
    )
    .join('\n');

  const prompt = `You are matching an ACH bank record to the correct client.

ACH record:
- company: "${rec.company}"
- signer first name: "${rec.firstName}"
- signer last name: "${rec.lastName}"

Candidate clients:
${candidates}

Pick the ONE client that best matches. A strong match is when the ACH company matches a client's legal entity / company / quickbooks / shipHero name (allow for LLC/Inc suffixes and minor spelling differences) and/or the signer's first+last name matches one of that client's contacts. If no candidate is a confident match, return an empty clientId.

Return ONLY a JSON object: {"clientId": "<id from the list, or empty string>", "confidence": "high" | "medium" | "low", "reason": "<one short sentence>"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API error (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const raw: string = data.content?.[0]?.text || '';
  let parsed: { clientId?: string; confidence?: string; reason?: string };
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    parsed = JSON.parse(m[0]);
  }

  const clientId = String(parsed.clientId || '').trim();
  if (!clientId) return null;
  const matched = ranked.find(c => c.id === clientId);
  if (!matched) return null; // Claude must pick from the given ids
  const confidence =
    parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
      ? parsed.confidence
      : 'low';
  return { clientId, clientName: matched.name, confidence, reason: String(parsed.reason || '') };
}
