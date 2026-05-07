import { NextRequest, NextResponse } from 'next/server';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const HUB_USERS_BOARD_ID = 9833973620;
const HUB_USERS_GROUP_ID = 'group_mkwgntv6'; // "Hub Users" group

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

// POST /api/hub-users/add
// Body: { name, email, phone, role: 'Member'|'Admin', clientBoardItemId }
export async function POST(req: NextRequest) {
  const { name, email, phone, role, clientBoardItemId } = await req.json();

  if (!name && !email) {
    return NextResponse.json({ error: 'name or email required' }, { status: 400 });
  }

  try {
    const columnValues: Record<string, unknown> = {
      text_mkwnesea: email || '',           // Hub Login Email
      color_mkwg1e5c: { label: role || 'Member' }, // Type: Member / Admin
    };

    // Link to Clients board item if provided
    if (clientBoardItemId) {
      columnValues.board_relation_mkwg6cnc = { item_ids: [parseInt(clientBoardItemId, 10)] };
    }

    const data = await mondayQuery(
      `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
        create_item(
          board_id: $boardId
          group_id: $groupId
          item_name: $itemName
          column_values: $columnValues
        ) { id name }
      }`,
      {
        boardId: String(HUB_USERS_BOARD_ID),
        groupId: HUB_USERS_GROUP_ID,
        itemName: name || email,
        columnValues: JSON.stringify(columnValues),
      }
    );

    const created = data?.create_item;
    return NextResponse.json({ ok: true, itemId: created?.id, itemName: created?.name });
  } catch (err) {
    console.error('[hub-users/add]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
