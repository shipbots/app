import { NextResponse } from 'next/server';
import { fetchOnboardingItems } from '@/lib/monday';

export async function GET() {
  try {
    const items = await fetchOnboardingItems();
    return NextResponse.json(items);
  } catch (error) {
    console.error('Failed to fetch onboarding items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch onboarding data' },
      { status: 500 }
    );
  }
}
