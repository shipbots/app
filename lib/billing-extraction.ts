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

// ─── ACH form extraction (Client Billing Info board) ─────────────────────────

export interface ExtractedACHInfo {
  financialInstitution: string;
  accountNumber: string;
  routingNumber: string;
  firstName: string;
  lastName: string;
}

const ACH_EXTRACTION_PROMPT = `Extract the bank / ACH account details from this document and return ONLY a JSON object with exactly these keys:

- "financialInstitution": the bank / financial institution name (string)
- "accountNumber": the bank account number (string — digits only, no spaces or dashes)
- "routingNumber": the ABA routing / transit number (string — 9 digits, digits only)
- "firstName": the account holder's / signer's first name (string)
- "lastName": the account holder's / signer's last name (string)

If a field cannot be found in the document, use an empty string "".
Return ONLY the raw JSON object — no markdown code fences, no explanation text.`;

/**
 * Extract ACH banking fields from a PDF or image (base64-encoded). Used by the
 * Billing Info tab's ACH upload to auto-fill the Client Billing Info board.
 * Throws if SHIPBOTS_ANTHROPIC_KEY isn't set or the API returns an error.
 */
export async function extractACHFromFile(base64: string, mediaType: string): Promise<ExtractedACHInfo> {
  const anthropicKey = process.env.SHIPBOTS_ANTHROPIC_KEY;
  if (!anthropicKey) {
    throw new Error('SHIPBOTS_ANTHROPIC_KEY not configured');
  }

  // PDFs go in a `document` block; scans / photos in an `image` block.
  const fileBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

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
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: ACH_EXTRACTION_PROMPT }] }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawText: string = data.content?.[0]?.text || '';
  try {
    return JSON.parse(rawText.trim()) as ExtractedACHInfo;
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as ExtractedACHInfo;
    throw new Error(`Could not parse ACH extraction response: ${rawText.slice(0, 200)}`);
  }
}

// ─── Pricing extraction (DocuSign Statement of Work) ─────────────────────────
// The pricing for a 3PL client lives on the LAST page of the signed contract,
// under a "Statement of Work" (SOW) heading. The "Extract from DocuSign" button
// on the Billing tab reads it into the dedicated pricing columns. Keys match the
// ClientInfo pricing field names so the caller can write them straight through.

export interface ExtractedPricingInfo {
  receivingPricing: string;
  floorLoadedFee: string;
  binStorage: string;
  palletStorage: string;
  dtcPickPackPricing: string;
  b2bPickPack: string;
  shippingUpcharge: string;
  intlShippingUpcharge: string;
  returnsFee: string;
  accountManagerFee: string;
  platformFee: string;
  paymentTerms: string;
  otherNotes: string;
}

const PRICING_EXTRACTION_PROMPT = `This is a ShipBots 3PL fulfillment contract (DocuSign). The pricing you need is on the LAST page, in the section under the "Statement of Work" (SOW) heading. Read that pricing carefully and return ONLY a JSON object with EXACTLY these keys (no markdown fences, no commentary). If a value is not present in the document, use an empty string "".

- "receivingPricing": the receiving fee(s). Include the per-item receiving fee AND, if present, the barcoding and bagging fees. Combine into one readable string, e.g. "Receiving $0.05/item; Barcoding $0.25/item; Bagging $0.45/bag".
- "floorLoadedFee": a Floor Loaded (truck/container) Unloading Fee, if present. Most contracts do NOT have this — empty string if not found.
- "binStorage": bin storage price. May be quoted per pick, per month, or per day — copy what's there, e.g. "Bins $0.17/day".
- "palletStorage": pallet storage price. May be per day, per month, or per week, e.g. "Pallet $1/day".
- "dtcPickPackPricing": the DTC (direct-to-consumer) pick & pack price. It usually has TWO components — a per-order "pick" fee and a per-item fee — e.g. "$1.50 per order + $0.45/item". Treat the standard/default pick & pack as DTC UNLESS it is explicitly marked B2B or wholesale.
- "b2bPickPack": the B2B / wholesale pick & pack price, ONLY if the contract has a separate one. Signals: it is explicitly labeled "B2B" or "wholesale"; OR there is a second, cheaper pick & pack; OR a rule where the per-item fee drops when an order has more than ~10 items. Empty string if the contract has no B2B pricing.
- "shippingUpcharge": the DOMESTIC shipping upcharge codes. These look like a "V" followed by three digits, often chained with thresholds. Copy the ENTIRE line verbatim, e.g. "V218 < 2 > V430 < 5 > V450 < 10 > V550". Do NOT include the international (INT) line here.
- "intlShippingUpcharge": the INTERNATIONAL shipping upcharge. Same "V"+three-digit format but identified by an "INT" prefix, e.g. "INT V330". Copy verbatim. Empty string if none.
- "returnsFee": the returns fee, usually per unit, e.g. "$2.95/unit".
- "accountManagerFee": the Dedicated Account Manager fee (may be phrased "Real-Time WMS & In-Warehouse Dedicated Account Manager"). Usually per week, e.g. "$49/week". If it is explicitly zero, return "$0". If there is genuinely no such fee, empty string.
- "platformFee": a recurring platform / monthly service fee that is NOT the account manager fee (for example a fee to connect the store to the WMS). If you find a recurring monthly or weekly service charge that is not clearly the account manager fee and does not fit any other category, put it here, e.g. "$99/month". Empty string if none.
- "paymentTerms": the payment terms, e.g. "Net 4", "Net 7", "Net 15" (may appear as "Net4"). Empty string if not stated.
- "otherNotes": any other relevant pricing or promotional info from the Statement of Work that does NOT fit a field above — e.g. inserts, special projects, kitting, promotions, discounts, or alternative pricing. Keep line breaks. Empty string if nothing else.

Return ONLY the raw JSON object.`;

/**
 * Extract the 3PL pricing (Statement of Work) from a base64-encoded contract PDF.
 * Throws if SHIPBOTS_ANTHROPIC_KEY isn't set or the API errors / can't be parsed.
 */
export async function extractPricingFromPDF(base64: string): Promise<ExtractedPricingInfo> {
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
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: PRICING_EXTRACTION_PROMPT },
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
  try {
    return JSON.parse(rawText.trim()) as ExtractedPricingInfo;
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as ExtractedPricingInfo;
    throw new Error(`Could not parse pricing extraction response: ${rawText.slice(0, 200)}`);
  }
}
