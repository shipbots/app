import { NextResponse } from 'next/server';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const ONBOARDING_BOARD_ID = '6004116565';
const ONBOARDING_GROUP_ID = 'new_group';           // "Client to OnBoard"
const CLIENTS_BOARD_ID = '7846251224';
const CLIENTS_GROUP_ID = '1731530494_companys___freshdes__1'; // "Company (No Commas In Name)"

function getApiKey(): string {
  const key = process.env.MONDAY_API_KEY;
  if (!key) throw new Error('MONDAY_API_KEY not set in environment');
  return key;
}

async function mondayMutation(query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getApiKey(),
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (data.errors) {
    console.error('[create-client] Monday.com error:', data.errors);
    throw new Error(data.errors[0]?.message || 'Monday.com API error');
  }
  return data.data;
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Client name is required' }, { status: 400 });
    }
    const clientName = name.trim();

    // ── Step 1: Create item on the Clients board ──────────────────────────────
    console.log(`[create-client] Creating client on Clients board: "${clientName}"`);
    const clientResult = await mondayMutation(
      `mutation ($boardId: ID!, $groupId: String!, $itemName: String!) {
        create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName) {
          id
          name
        }
      }`,
      {
        boardId: CLIENTS_BOARD_ID,
        groupId: CLIENTS_GROUP_ID,
        itemName: clientName,
      }
    );

    const clientItemId = clientResult?.create_item?.id;
    if (!clientItemId) {
      throw new Error('Failed to create client on Clients board — no id returned');
    }
    console.log(`[create-client] Clients board item created: id=${clientItemId}`);

    // ── Step 2: Create item on the Onboarding board with "Not Started" status
    //           and link to the Clients board item ─────────────────────────────
    const columnValues = JSON.stringify({
      estado: { label: 'Not Started' },
      connect_boards: { item_ids: [parseInt(clientItemId, 10)] },
    });

    console.log(`[create-client] Creating onboarding item, linking to client id=${clientItemId}`);
    const onboardingResult = await mondayMutation(
      `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
        create_item(
          board_id: $boardId,
          group_id: $groupId,
          item_name: $itemName,
          column_values: $columnValues,
          create_labels_if_missing: true
        ) {
          id
          name
          url
          created_at
          updated_at
        }
      }`,
      {
        boardId: ONBOARDING_BOARD_ID,
        groupId: ONBOARDING_GROUP_ID,
        itemName: clientName,
        columnValues,
      }
    );

    const onboardingItem = onboardingResult?.create_item;
    if (!onboardingItem?.id) {
      throw new Error('Failed to create item on Onboarding board — no id returned');
    }
    console.log(`[create-client] Onboarding item created: id=${onboardingItem.id}`);

    return NextResponse.json({
      ok: true,
      clientItemId,
      onboardingItemId: onboardingItem.id,
      name: onboardingItem.name,
      url: onboardingItem.url,
    });
  } catch (error) {
    console.error('[create-client] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create client' },
      { status: 500 }
    );
  }
}
