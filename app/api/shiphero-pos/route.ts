import { NextRequest, NextResponse } from 'next/server';

export interface ShipHeroPO {
  id: string;           // decoded numeric ShipHero ID
  encodedId: string;    // original base64 ID from Windsor
  poNumber: string;
  status: string;
  poDate: string | null;
  arrivedAt: string | null;
  dateClosed: string | null;
  totalPrice: string;
  trackingNumber: string;
  pdfUrl: string | null;
  partnerOrderNumber: string | null;
  description: string;
  shipheroUrl: string;
}

/** Decode Windsor/ShipHero base64 item ID to a numeric ID.
 *  e.g. "UHVyY2hhc2VPcmRlcjozNTA0OTU2" → "PurchaseOrder:3504956" → "3504956"
 */
function decodeShipHeroId(encodedId: string): string {
  try {
    const decoded = Buffer.from(encodedId, 'base64').toString('utf8');
    return decoded.split(':')[1] || encodedId;
  } catch {
    return encodedId;
  }
}

/** Build search terms from a client name — tries full name and individual words. */
function buildSearchTerms(clientName: string): string[] {
  const trimmed = clientName.trim();
  if (!trimmed) return [];
  // Remove common suffixes that won't appear in PO numbers
  const cleaned = trimmed.replace(/\b(LLC|Inc\.?|Corp\.?|Ltd\.?|Co\.?)\b/gi, '').trim();
  const terms: string[] = [];
  // Try full cleaned name
  if (cleaned.length >= 3) terms.push(cleaned);
  // Try first 3 words
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
  if (words.length > 1) terms.push(words.slice(0, 3).join(' '));
  if (words.length > 1) terms.push(words.slice(0, 2).join(' '));
  // Try first significant word (4+ chars)
  const firstSignificant = words.find(w => w.length >= 4);
  if (firstSignificant) terms.push(firstSignificant);
  // Deduplicate
  return [...new Set(terms)];
}

async function fetchPOsFromWindsor(searchTerm: string, apiKey: string, accountId: string): Promise<ShipHeroPO[]> {
  const fields = [
    'purchase_order_id',
    'purchase_order_po_number',
    'purchase_order_fulfillment_status',
    'purchase_order_po_date',
    'purchase_order_arrived_at',
    'purchase_order_date_closed',
    'purchase_order_total_price',
    'purchase_order_tracking_number',
    'purchase_order_pdf',
    'purchase_order_partner_order_number',
    'purchase_order_description',
  ].join(',');

  // Case-insensitive substring match on PO number
  const filters = JSON.stringify([['purchase_order_po_number', 'contains', searchTerm]]);

  const params = new URLSearchParams({
    key: apiKey,
    connector: 'shiphero',
    accounts: accountId,
    fields,
    date_preset: 'last_2years',
    filters,
  });

  const res = await fetch(`https://api.windsor.ai/data/v1?${params.toString()}`, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 300 }, // cache 5 min
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Windsor API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const rows: Record<string, string | null>[] = data?.result ?? data?.data ?? [];

  return rows
    .filter(r => r.purchase_order_id && r.purchase_order_po_number)
    .map(r => {
      const encodedId = r.purchase_order_id!;
      const numericId = decodeShipHeroId(encodedId);
      return {
        id: numericId,
        encodedId,
        poNumber: r.purchase_order_po_number || '',
        status: r.purchase_order_fulfillment_status || 'unknown',
        poDate: r.purchase_order_po_date || null,
        arrivedAt: r.purchase_order_arrived_at || null,
        dateClosed: r.purchase_order_date_closed || null,
        totalPrice: r.purchase_order_total_price || '0',
        trackingNumber: r.purchase_order_tracking_number || '',
        pdfUrl: r.purchase_order_pdf || null,
        partnerOrderNumber: r.purchase_order_partner_order_number || null,
        description: r.purchase_order_description || '',
        shipheroUrl: `https://app.shiphero.com/dashboard/purchase-orders/${numericId}`,
      };
    });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientName = searchParams.get('client') || '';
  const shipHeroName = searchParams.get('shipHeroName') || '';

  const apiKey = process.env.WINDSOR_API_KEY;
  const accountId = process.env.WINDSOR_SHIPHERO_ACCOUNT_ID || '92';

  if (!apiKey) {
    return NextResponse.json(
      { error: 'WINDSOR_API_KEY not configured. Add it to .env.local from app.windsor.ai → Settings → API.' },
      { status: 503 }
    );
  }

  if (!clientName && !shipHeroName) {
    return NextResponse.json([]);
  }

  try {
    // Build search terms from both client name and ShipHero name
    const allTerms = [
      ...buildSearchTerms(clientName),
      ...buildSearchTerms(shipHeroName),
    ];
    const uniqueTerms = [...new Set(allTerms)];

    // Try search terms in priority order — stop at first hit
    let results: ShipHeroPO[] = [];
    for (const term of uniqueTerms) {
      if (term.length < 2) continue;
      const pos = await fetchPOsFromWindsor(term, apiKey, accountId);
      if (pos.length > 0) {
        results = pos;
        break;
      }
    }

    // Sort: pending/processing first, then by date descending
    results.sort((a, b) => {
      const priority = (s: string) =>
        s === 'pending' || s === 'processing' ? 0 : s === 'draft' ? 1 : 2;
      const p = priority(a.status) - priority(b.status);
      if (p !== 0) return p;
      const da = a.poDate || a.arrivedAt || '';
      const db = b.poDate || b.arrivedAt || '';
      return db.localeCompare(da);
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error('ShipHero PO fetch failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch POs' },
      { status: 500 }
    );
  }
}
