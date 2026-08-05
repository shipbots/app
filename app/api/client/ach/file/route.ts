/**
 * POST /api/client/ach/file  (multipart: file, itemId?, clientId?, clientName?)
 *
 * Upload / replace the ACH document on a "Client Billing Info" board item, then:
 *   - create the record first (linked to the client) if there isn't one yet,
 *   - extract the ACH fields from the uploaded PDF / image and write them to the
 *     board columns (best-effort — the upload still succeeds if extraction fails).
 *
 * Gated to the DocuSign-access group like the rest of the ACH endpoints.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canUseDocusign } from '@/lib/docusign-access';
import { extractACHFromFile } from '@/lib/billing-extraction';
import { markPaymentRetrievedForClient } from '@/lib/monday';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // PDF extraction (Claude) can take several seconds

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_FILE_URL = 'https://api.monday.com/v2/file';
const BILLING_BOARD_ID = '18422386902';

const COL_DOC        = 'file_mm5aqrwq';
const COL_FIRST      = 'text_mm5gjfsv';
const COL_LAST       = 'text_mm5gk3v5';
const COL_ROUTING    = 'text_mm5g5sge';
const COL_ACCOUNT    = 'text_mm5gn0xc';
const COL_FINANCIAL  = 'text_mm5gbaz0';
const COL_CLIENT_LINK = 'board_relation_mm5gxg2g';

async function mondayGql(query: string, key: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key, 'API-Version': '2024-10' },
    body: JSON.stringify(variables ? { query, variables } : { query }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'monday error');
  return data.data ?? {};
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await canUseDocusign(email))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const key = process.env.MONDAY_API_KEY;
  if (!key) return NextResponse.json({ error: 'MONDAY_API_KEY not set' }, { status: 500 });

  const form = await req.formData();
  const file = form.get('file');
  let itemId = String(form.get('itemId') || '').trim();
  const clientId = String(form.get('clientId') || '').trim();
  const clientName = String(form.get('clientName') || '').trim();
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  try {
    // 1) Create the record if we don't have one yet, linked to the client via
    //    the "✳️ CLIENTS" board-relation so it's tied to the right client.
    if (!/^\d+$/.test(itemId)) {
      if (!clientName) return NextResponse.json({ error: 'Missing client' }, { status: 400 });
      const cols = /^\d+$/.test(clientId)
        ? JSON.stringify({ [COL_CLIENT_LINK]: { item_ids: [Number(clientId)] } })
        : '{}';
      const created = await mondayGql(
        `mutation ($name: String!, $cols: JSON!) { create_item(board_id: ${BILLING_BOARD_ID}, item_name: $name, column_values: $cols) { id } }`,
        key, { name: clientName, cols },
      );
      itemId = String((created.create_item as { id?: string } | undefined)?.id || '');
      if (!/^\d+$/.test(itemId)) throw new Error('create failed');
    }

    // 2) Upload the file to the ACH Doc column.
    const bytes = Buffer.from(await file.arrayBuffer());
    const mondayForm = new FormData();
    mondayForm.append(
      'query',
      `mutation ($file: File!) { add_file_to_column(item_id: ${itemId}, column_id: "${COL_DOC}", file: $file) { id url public_url name } }`,
    );
    mondayForm.append('variables[file]', new Blob([bytes]), file.name);
    const upRes = await fetch(MONDAY_FILE_URL, { method: 'POST', headers: { Authorization: key }, body: mondayForm });
    const upData = await upRes.json();
    if (upData.errors) throw new Error(upData.errors[0]?.message || 'upload error');
    const asset = upData.data?.add_file_to_column;

    // 3) Extract ACH fields from the PDF / image and write them to the board
    //    (best-effort — a failed extraction never fails the upload).
    let extracted: Record<string, string> | null = null;
    const mediaType = file.type || '';
    if (mediaType === 'application/pdf' || mediaType.startsWith('image/')) {
      try {
        const info = await extractACHFromFile(bytes.toString('base64'), mediaType);
        const patches: Array<[string, string]> = [];
        if (info.financialInstitution) patches.push([COL_FINANCIAL, info.financialInstitution]);
        if (info.accountNumber) patches.push([COL_ACCOUNT, info.accountNumber]);
        if (info.routingNumber) patches.push([COL_ROUTING, info.routingNumber]);
        if (info.firstName) patches.push([COL_FIRST, info.firstName]);
        if (info.lastName) patches.push([COL_LAST, info.lastName]);
        for (const [col, val] of patches) {
          await mondayGql(
            `mutation ($v: String!) { change_simple_column_value(board_id: ${BILLING_BOARD_ID}, item_id: ${itemId}, column_id: "${col}", value: $v) { id } }`,
            key, { v: val },
          );
        }
        extracted = {
          financialInstitution: info.financialInstitution || '',
          accountNumber: info.accountNumber || '',
          routingNumber: info.routingNumber || '',
          firstName: info.firstName || '',
          lastName: info.lastName || '',
        };
      } catch (e) {
        console.error('[client/ach/file] extraction failed:', e);
      }
    }

    // If we pulled real bank details out of the doc, ACH is on file → set the
    // client's "Retrieved payment information" step to "Yes" (best-effort).
    if (/^\d+$/.test(clientId) && extracted?.accountNumber) {
      await markPaymentRetrievedForClient(clientId);
    }

    return NextResponse.json({
      ok: true,
      itemId,
      assetId: String(asset?.id || ''),
      url: asset?.public_url || asset?.url || '',
      name: asset?.name || file.name,
      extracted,
    });
  } catch (err) {
    console.error('[client/ach/file] failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 });
  }
}
