import { NextRequest, NextResponse } from 'next/server';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const HUB_USERS_BOARD_ID = 9833973620;

async function mondayQuery(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.MONDAY_API_KEY!,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'Monday API error');
  return data.data;
}

// GET /api/hub-users/check?email=xxx
// Returns { exists: boolean, itemId?: string }
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase();
  if (!email) return NextResponse.json({ exists: false });

  try {
    const data = await mondayQuery(`
      query {
        boards(ids: [${HUB_USERS_BOARD_ID}]) {
          items_page(limit: 5, query_params: {
            rules: [{ column_id: "text_mkwnesea", compare_value: ${JSON.stringify([email])}, operator: any_of }]
          }) {
            items { id name }
          }
        }
      }
    `);

    const items: { id: string; name: string }[] = data?.boards?.[0]?.items_page?.items ?? [];
    if (items.length > 0) {
      return NextResponse.json({ exists: true, itemId: items[0].id, itemName: items[0].name });
    }
    return NextResponse.json({ exists: false });
  } catch (err) {
    console.error('[hub-users/check]', err);
    return NextResponse.json({ exists: false, error: String(err) }, { status: 500 });
  }
}
