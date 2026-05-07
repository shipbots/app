import { NextResponse } from 'next/server';
import { fetchSubitemBoardInfo } from '@/lib/monday';

export async function GET() {
  try {
    const info = await fetchSubitemBoardInfo();
    return NextResponse.json(info, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch (err) {
    console.error('fetchSubitemBoardInfo error:', err);
    return NextResponse.json(
      { statusColumnId: null, statusOptions: [], dateColumnId: null },
      { status: 200 } // return empty rather than error so form still renders
    );
  }
}
