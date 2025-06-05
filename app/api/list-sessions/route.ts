import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const apiKey = process.env.HEYGEN_API_KEY;
    if (!apiKey) {
      throw new Error('API key not found');
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_API_URL}/v1/streaming.list`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'x-api-key': apiKey
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in list-sessions API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 