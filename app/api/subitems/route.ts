import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSubitems, createSubitem } from '@/lib/monday';

export async function GET() {
  try {
    const subitems = await fetchAllSubitems();
    return NextResponse.json(subitems, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('fetchAllSubitems error:', err);
    return NextResponse.json({ error: 'Failed to fetch all tasks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      parentItemId: string;
      parentItemName: string;
      name: string;
      statusColumnId?: string;
      status?: string;
      dateColumnId?: string;
      dueDate?: string;
      notes?: string;
      assigneeColumnId?: string;
      assignees?: string[];
    };

    if (!body.parentItemId || !body.name?.trim()) {
      return NextResponse.json({ error: 'parentItemId and name are required' }, { status: 400 });
    }

    const task = await createSubitem(body.parentItemId, body.name.trim(), {
      statusColumnId: body.statusColumnId,
      status: body.status,
      dateColumnId: body.dateColumnId,
      dueDate: body.dueDate,
      notes: body.notes,
      assigneeColumnId: body.assigneeColumnId,
      assignees: body.assignees,
    });

    return NextResponse.json({ ...task, parentItemName: body.parentItemName });
  } catch (err) {
    console.error('createSubitem error:', err);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
