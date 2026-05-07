import { NextRequest, NextResponse } from 'next/server';
import { fetchSubitems, updateSubitem } from '@/lib/monday';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const subitems = await fetchSubitems(id);
    return NextResponse.json(subitems);
  } catch (err) {
    console.error('fetchSubitems error:', err);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json() as {
      boardId: string;
      name?: string;
      status?: string;
      statusColumnId?: string;
      dueDate?: string;
      dateColumnId?: string;
    };
    if (!body.boardId) {
      return NextResponse.json({ error: 'boardId is required' }, { status: 400 });
    }
    await updateSubitem(id, body.boardId, {
      name: body.name,
      statusColumnId: body.statusColumnId,
      status: body.status,
      dateColumnId: body.dateColumnId,
      dueDate: body.dueDate,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('updateSubitem error:', err);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
