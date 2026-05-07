import { NextResponse } from 'next/server';
import { fetchAgentEmailMap } from '@/lib/monday';

export async function GET() {
  try {
    const map = await fetchAgentEmailMap();
    return NextResponse.json(map);
  } catch (error) {
    console.error('Failed to fetch agent email map:', error);
    return NextResponse.json({}, { status: 500 });
  }
}
