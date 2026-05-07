import { NextResponse } from 'next/server';
import { fetchAgentOptions } from '@/lib/monday';

export async function GET() {
  try {
    const agents = await fetchAgentOptions();
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Failed to fetch agent options:', error);
    return NextResponse.json([], { status: 500 });
  }
}
