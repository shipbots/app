/**
 * Shared billing extraction logic — used by both:
 *   - /api/client/[id]/extract-docusign  (manual "Copy from DocuSign" button)
 *   - /api/docusign/webhook              (auto-sync when envelope is completed)
 */

export interface ExtractedBillingInfo {
  legalEntity: string;
  ein: string;
  billingStreet1: string;
  billingStreet2: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  dateDocusignSigned: string; // YYYY-MM-DD
}

const EXTRACTION_PROMPT = `Extract the following information from this DocuSign/contract document and return ONLY a JSON object with exactly these keys:

- "legalEntity": legal name of the entity/company signing (string)
- "ein": EIN or Tax ID number (string, digits and dashes only, no labels like "EIN:" prefix)
- "billingStreet1": billing address street line 1 (string)
- "billingStreet2": billing address street line 2 / suite / unit (string, use empty string "" if not present)
- "billingCity": billing city (string)
- "billingState": billing state (string, 2-letter abbreviation for US states e.g. "CA", full name for non-US)
- "billingCountry": billing country as 2-letter ISO code (e.g. "US", "CA", "GB", "MX")
- "billingZip": billing zip or postal code (string)
- "dateDocusignSigned": the date the client/signer signed the document (string in YYYY-MM-DD format)

If a field cannot be found in the document, use an empty string "".
Return ONLY the raw JSON object — no markdown code fences, no explanation text.`;

/**
 * Send a base64-encoded PDF to Claude and extract billing fields.
 * Throws if SHIPBOTS_ANTHROPIC_KEY is not set or the API returns an error.
 */
export async function extractBillingFromPDF(base64: string): Promise<ExtractedBillingInfo> {
  const anthropicKey = process.env.SHIPBOTS_ANTHROPIC_KEY;
  if (!anthropicKey) {
    throw new Error('SHIPBOTS_ANTHROPIC_KEY not configured');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawText: string = data.content?.[0]?.text || '';

  // Try direct parse, then regex fallback if Claude wrapped in markdown
  try {
    return JSON.parse(rawText.trim()) as ExtractedBillingInfo;
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as ExtractedBillingInfo;
    }
    throw new Error(`Could not parse extraction response: ${rawText.slice(0, 200)}`);
  }
}
