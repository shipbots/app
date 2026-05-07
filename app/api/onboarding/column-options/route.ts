import { NextResponse } from 'next/server';

const ONBOARDING_BOARD_ID = '6004116565';
const MONDAY_API_URL = 'https://api.monday.com/v2';

// Status/dropdown columns on the Onboarding board exposed for client-info editing
const TARGET_COLUMN_IDS = new Set([
  'status_2', // Initial Inventory Delivered?
]);

export async function GET() {
  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) return NextResponse.json({}, { status: 503 });

  // Fetch ALL columns (no ids filter) — avoids Monday.com errors if any
  // individual column ID is wrong or the schema changes.
  const query = `query {
    boards(ids: [${ONBOARDING_BOARD_ID}]) {
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
      console.error('[onboarding/column-options] Monday.com error:', data.errors);
      return NextResponse.json({}, { status: 502 });
    }

    const allColumns: Array<{ id: string; type: string; settings_str: string }> =
      data.data?.boards?.[0]?.columns || [];

    // Log what we actually received for target columns so issues are visible in server logs
    for (const col of allColumns) {
      if (TARGET_COLUMN_IDS.has(col.id)) {
        console.log(`[onboarding/column-options] col ${col.id} type=${col.type} settings_str=${col.settings_str?.slice(0, 120)}`);
      }
    }
    if (allColumns.length === 0) {
      console.warn('[onboarding/column-options] No columns returned from Monday.com — check board ID and API key permissions');
    }

    const options: Record<string, string[]> = {};

    for (const col of allColumns) {
      if (!TARGET_COLUMN_IDS.has(col.id)) continue;

      try {
        const settings = JSON.parse(col.settings_str || '{}');

        // Monday.com returns type "color" for status columns in older API versions
        // and "status" in newer ones — handle both.
        if (col.type === 'color' || col.type === 'status') {
          const labelsObj: Record<string, string> = settings.labels || {};
          const labels = Object.values(labelsObj)
            .filter((l): l is string => typeof l === 'string' && l.trim().length > 0);
          if (labels.length > 0) options[col.id] = labels;

        } else if (col.type === 'dropdown') {
          const labelsArr: Array<{ id: number; name: string }> = settings.labels || [];
          const labels = labelsArr.map(l => l.name).filter(Boolean);
          if (labels.length > 0) options[col.id] = labels;
        }
      } catch { /* skip columns with malformed settings */ }
    }

    // Hard-coded fallbacks for columns that may not expose settings_str
    // (e.g. system status columns like status_2 on older boards).
    const FALLBACKS: Record<string, string[]> = {
      'status_2': ['Yes', 'Yes/ Not Received', 'No'],
    };
    for (const [id, vals] of Object.entries(FALLBACKS)) {
      if (TARGET_COLUMN_IDS.has(id) && !options[id]) options[id] = vals;
    }

    return NextResponse.json(options);
  } catch (err) {
    console.error('[onboarding/column-options] Fetch failed:', err);
    return NextResponse.json({}, { status: 500 });
  }
}
