/**
 * Shared pipeline for a completed/signed contract, however it arrives (DocuSign
 * Connect webhook OR a Zapier post to /api/docusign/ingest):
 *
 *   1. Match the signer email(s) to a client on the Monday Clients board.
 *   2. Upload the signed PDF to the linked onboarding item's contract file column.
 *   3. Extract billing (legal entity, EIN, address, signed date) AND pricing
 *      (SOW rates) with Claude and write them to the Clients board.
 *   4. Mark the contract signed on the onboarding item.
 *
 * When no client matches (a brand-new client whose record isn't in Monday yet),
 * it returns { found: false, reason: 'no_client_match' } so the caller can
 * notify — e.g. the Zap emails andres@shipbots.com.
 */
import {
  ONBOARDING_BOARD_ID,
} from './constants';
import {
  findClientBoardItemByEmail,
  findOnboardingItemByClientBoardId,
  updateClientField,
} from './monday';
import {
  extractBillingFromPDF,
  extractPricingFromPDF,
  type ExtractedBillingInfo,
  type ExtractedPricingInfo,
} from './billing-extraction';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_FILE_URL = 'https://api.monday.com/v2/file';

function apiKey(): string {
  const k = process.env.MONDAY_API_KEY;
  if (!k) throw new Error('MONDAY_API_KEY not set');
  return k;
}

// ── Upload a PDF to the onboarding item's "files" column ─────────────────────
export async function uploadPDFToMonday(
  onboardingItemId: string,
  pdfBuffer: Buffer,
  fileName = 'signed-contract.pdf',
): Promise<{ assetId: string; publicUrl: string }> {
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
  const form = new FormData();
  form.append(
    'query',
    `mutation ($file: File!) {
      add_file_to_column(item_id: ${onboardingItemId}, column_id: "files", file: $file) { id url public_url name }
    }`,
  );
  form.append('variables[file]', blob, fileName);
  const res = await fetch(MONDAY_FILE_URL, { method: 'POST', headers: { Authorization: apiKey() }, body: form });
  const data = await res.json();
  if (data.errors) throw new Error(`Monday file upload error: ${data.errors[0]?.message}`);
  const asset = data.data?.add_file_to_column;
  return { assetId: String(asset?.id || ''), publicUrl: asset?.public_url || asset?.url || '' };
}

// ── Write extracted billing fields to the Clients board ──────────────────────
export async function applyBillingFields(
  clientBoardItemId: string,
  info: ExtractedBillingInfo,
  signedDateOverride?: string,
): Promise<void> {
  const signedDate = (signedDateOverride || info.dateDocusignSigned || '').slice(0, 10);
  const fields: Array<{ columnId: string; value: string; isDate?: boolean }> = [
    { columnId: 'text_mktp4fvk', value: info.legalEntity },
    { columnId: 'text_mkxxfg1b', value: info.ein },
    { columnId: 'text_mkx5vzht', value: info.billingStreet1 },
    { columnId: 'text_mkx5f9p9', value: info.billingStreet2 },
    { columnId: 'text_mkx5z70k', value: info.billingCity },
    { columnId: 'text_mkx5er1a', value: info.billingState },
    { columnId: 'text_mkx5tjd7', value: info.billingZip },
    { columnId: 'text_mkx5kyv4', value: info.billingCountry },
    { columnId: 'date_mkw2fhte', value: signedDate, isDate: true },
  ];
  await Promise.all(
    fields.filter(f => f.value).map(f => updateClientField(clientBoardItemId, f.columnId, f.value, f.isDate ? 'date' : 'text')),
  );
}

// ── Write extracted SOW pricing to the Clients board ─────────────────────────
const PRICING_COLUMNS: Record<keyof ExtractedPricingInfo, string> = {
  receivingPricing:     'text_mm5hpark',
  floorLoadedFee:       'text_mm5hxygd',
  binStorage:           'text_mm5hwtkt',
  palletStorage:        'text_mm5h6606',
  dtcPickPackPricing:   'text_mm5hc2dg',
  b2bPickPack:          'text_mm5h4938',
  shippingUpcharge:     'text_mktqa6sm',
  intlShippingUpcharge: 'text_mm5h1w32',
  returnsFee:           'text_mm5hzk9n',
  accountManagerFee:    'text_mm5hb9',
  platformFee:          'text_mm5hq2xy',
  paymentTerms:         'text_mm5hgn1k',
  otherNotes:           'long_text_mm5hy744',
};

export async function applyPricingFields(
  clientBoardItemId: string,
  pricing: ExtractedPricingInfo,
): Promise<void> {
  const updates = (Object.keys(PRICING_COLUMNS) as Array<keyof ExtractedPricingInfo>)
    .map(key => ({ columnId: PRICING_COLUMNS[key], value: pricing[key] }))
    .filter(u => u.value && u.value.trim());
  await Promise.all(updates.map(u => updateClientField(clientBoardItemId, u.columnId, u.value, 'text')));
}

// ── Advance the onboarding item to "Contract Signed" ─────────────────────────
export async function markContractSigned(onboardingItemId: string): Promise<void> {
  // color_mktr9afd = "Sign Contract" checklist step; estado = pipeline status.
  const colValues = JSON.stringify(JSON.stringify({ color_mktr9afd: { label: 'Done' }, estado: { label: 'Contract Signed' } }));
  await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey(), 'API-Version': '2024-10' },
    body: JSON.stringify({
      query: `mutation {
        change_multiple_column_values(board_id: ${ONBOARDING_BOARD_ID}, item_id: ${onboardingItemId}, column_values: ${colValues}) { id }
      }`,
    }),
  });
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
export interface ContractIntakeInput {
  signerEmails: string[];
  companyName?: string;
  pdfBuffer: Buffer;
  /** ISO date the envelope completed; falls back to the extracted / today's date. */
  signedDate?: string;
  fileName?: string;
}

export interface ContractIntakeResult {
  found: boolean;
  reason?: string;
  clientBoardItemId?: string;
  clientName?: string;
  onboardingItemId?: string;
  assetId?: string;
  billingExtracted: boolean;
  pricingExtracted: boolean;
  signerEmails: string[];
  companyName?: string;
}

function safeName(name: string): string {
  return (name || 'contract').replace(/[^a-z0-9\-_ ]/gi, '').trim() || 'contract';
}

export async function processCompletedContract(input: ContractIntakeInput): Promise<ContractIntakeResult> {
  const signerEmails = input.signerEmails.map(e => String(e).trim()).filter(Boolean);
  const base: ContractIntakeResult = {
    found: false, billingExtracted: false, pricingExtracted: false, signerEmails, companyName: input.companyName,
  };
  if (signerEmails.length === 0) return { ...base, reason: 'no_signer_emails' };

  // 1. Match to a client by signer email.
  const client = await findClientBoardItemByEmail(signerEmails);
  if (!client) return { ...base, reason: 'no_client_match' }; // brand-new client → caller notifies

  const onboarding = await findOnboardingItemByClientBoardId(client.id);
  const result: ContractIntakeResult = {
    ...base, found: true, clientBoardItemId: client.id, clientName: client.name, onboardingItemId: onboarding?.id,
  };

  const pdfBase64 = input.pdfBuffer.toString('base64');

  // 2. Upload the signed PDF to the onboarding item's contract file column.
  if (onboarding) {
    try {
      const asset = await uploadPDFToMonday(onboarding.id, input.pdfBuffer, `${safeName(client.name)}-signed.pdf`);
      result.assetId = asset.assetId;
    } catch (err) {
      console.error('[contract-intake] Monday upload failed:', err);
      result.reason = 'upload_failed';
    }
  } else {
    // No linked onboarding item: we can still fill billing/pricing on the client
    // board, but there's no files column to upload the PDF to.
    result.reason = 'no_onboarding_item';
  }

  // 3a. Billing (legal entity, EIN, address, signed date).
  try {
    const billing = await extractBillingFromPDF(pdfBase64);
    await applyBillingFields(client.id, billing, input.signedDate);
    result.billingExtracted = true;
  } catch (err) {
    console.warn('[contract-intake] billing extraction failed (non-fatal):', err);
  }

  // 3b. Pricing (SOW rates).
  try {
    const pricing = await extractPricingFromPDF(pdfBase64);
    await applyPricingFields(client.id, pricing);
    result.pricingExtracted = true;
  } catch (err) {
    console.warn('[contract-intake] pricing extraction failed (non-fatal):', err);
  }

  // 4. Mark contract signed on the onboarding item.
  if (onboarding) {
    try { await markContractSigned(onboarding.id); }
    catch (err) { console.warn('[contract-intake] status update failed (non-fatal):', err); }
  }

  return result;
}
