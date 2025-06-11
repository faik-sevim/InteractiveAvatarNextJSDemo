import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Get API key from environment variables (like list-sessions does)
    const apiKey = process.env.HEYGEN_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 401 });
    }

    const { session_id } = await request.json();

    if (!session_id) {
      return NextResponse.json({ error: 'No session ID provided' }, { status: 400 });
    }

    // Use the official HeyGen API documentation format
    const response = await fetch('https://api.heygen.com/v1/streaming.stop', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ session_id }),
    });

    if (!response.ok) {
      throw new Error(`Failed to close session: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in close-session API:', error);
    return NextResponse.json({ error: 'Failed to close session' }, { status: 500 });
  }
} 