import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const { session_id } = await request.json();

    if (!session_id) {
      return NextResponse.json({ error: 'No session ID provided' }, { status: 400 });
    }

    const response = await fetch('https://api.heygen.com/v1/streaming.stop', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
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