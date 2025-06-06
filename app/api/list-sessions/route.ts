import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const apiKey = process.env.HEYGEN_API_KEY;
    if (!apiKey) {
      throw new Error('API key not found');
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_API_URL}/v1/streaming.list`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'x-api-key': apiKey
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in list-sessions API:', error);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error("Request timed out after 5 seconds");
        return NextResponse.json(
          { error: 'Request timeout - please check your internet connection' },
          { status: 408 }
        );
      }
      
      if (error.message.includes('fetch failed') || error.message.includes('ConnectTimeoutError')) {
        console.error("Network connection failed");
        return NextResponse.json(
          { error: 'Network connection failed - please check your internet connection' },
          { status: 503 }
        );
      }
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 