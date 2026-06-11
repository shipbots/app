import { NextResponse } from 'next/server';

const CLIENTS_BOARD_ID = '7846251224';
const MONDAY_API_URL = 'https://api.monday.com/v2';

// All status/dropdown columns on the Clients board that we want to expose for editing
const TARGET_COLUMN_IDS = new Set([
  'color_mktq81r3',    // Product Category
  'color_mkvq7kn6',    // Client Status
  'color_mkx5yjnk',    // Billing Name Updated
  'color_mktpwd5s',    // Order Inserts
  'color_mktq9ekf',    // Overnight Delivery
  'color_mktq43r0',    // International Fulfillment
  'color_mkwytd1b',    // International Shipping DDU/DDP
  'color_mktqw7rg',    // Amazon FBA
  'color_mktrs5ah',    // Items Barcoded
  'color_mkxfrgba',    // Returns Process
  'color_mkzf33yv',    // Returns - Incomplete Condition
  'color_mkxfa9h5',    // Returns - Damaged Condition
  'color_mkxfkdyh',    // Returns - New Condition
  'color_mkxfxdx5',    // Returns - Used Condition
  'dropdown_mktxaege', // Warehouse Location
  'dropdown_mkyk2va7', // Umbrella Company
  'dropdown_mktq27te', // Current Fulfillment Method
  'dropdown_mktptjhb', // Packaging
  'dropdown_mktpdnn0', // Pre-Storage Needs
  'dropdown_mktzcdg0', // Shipping Method
  'dropdown_mktrbeyg', // Portal Dropdown
  'dropdown_mm28h9mz', // TikTok Shop?
  'dropdown_mm28rr9y', // Lot Code / Expiration Needed?
  'dropdown_mm47p3h7', // Outside Labels?
]);

export async function GET() {
  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) return NextResponse.json({}, { status: 503 });

  // Fetch ALL columns (no ids filter) — more robust than filtering in the query,
  // avoids Monday.com errors if any individual column ID is wrong or stale.
  const query = `query {
    boards(ids: [${CLIENTS_BOARD_ID}]) {
      columns {
        id
        type
        settings_str
      }
    }
  }`;

  try {
    const res = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    const data = await res.json();

    // Surface Monday.com API errors instead of silently returning {}
    if (data.errors) {
      console.error('[column-options] Monday.com error:', data.errors);
      return NextResponse.json({}, { status: 502 });
    }

    const allColumns: Array<{ id: string; type: string; settings_str: string }> =
      data.data?.boards?.[0]?.columns || [];

    const options: Record<string, string[]> = {};

    for (const col of allColumns) {
      // Only process columns we actually use in the UI
      if (!TARGET_COLUMN_IDS.has(col.id)) continue;

      try {
        const settings = JSON.parse(col.settings_str || '{}');

        if (col.type === 'color' || col.type === 'status') {
          // Status columns: labels is an object { "1": "Done", "2": "Pending", ... }
          // Monday.com returns type "color" in older API versions and "status" in newer ones.
          const labelsObj: Record<string, string> = settings.labels || {};
          const labels = Object.values(labelsObj)
            .filter((l): l is string => typeof l === 'string' && l.trim().length > 0);
          if (labels.length > 0) options[col.id] = labels;

        } else if (col.type === 'dropdown') {
          // Dropdown columns: labels is an array [{ id, name }, ...]
          const labelsArr: Array<{ id: number; name: string }> = settings.labels || [];
          const labels = labelsArr.map(l => l.name).filter(Boolean);
          if (labels.length > 0) options[col.id] = labels;
        }
      } catch { /* skip columns with malformed settings */ }
    }

    // No cache header — options change rarely but must stay fresh.
    // Let the browser re-fetch every time rather than caching a stale/empty response.
    return NextResponse.json(options);
  } catch (err) {
    console.error('[column-options] Fetch failed:', err);
    return NextResponse.json({}, { status: 500 });
  }
}
