import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Get API key from environment variables (like list-sessions does)
    const apiKey = process.env.HEYGEN_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 401 });
    }

    const { session_id, force } = await request.json();

    if (!session_id) {
      return NextResponse.json({ error: 'No session ID provided' }, { status: 400 });
    }

    console.log(`💀 HARDCLOSE API: Attempting to force close session ${session_id}`);

    // Retry logic for hardclose - try multiple times with different approaches
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`💀 HARDCLOSE API: Attempt ${attempt}/${maxRetries} for session ${session_id}`);

        // Use the official HeyGen API documentation format
        const response = await fetch('https://api.heygen.com/v1/streaming.stop', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify({ 
            session_id,
            force: force || true  // Force parameter if supported
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`💀✅ HARDCLOSE API: Success on attempt ${attempt} for session ${session_id}`);
          return NextResponse.json({ 
            ...data, 
            hardclose: true, 
            attempt,
            message: `Session forcefully closed on attempt ${attempt}`
          });
        }

        // If regular stop fails, try with different timeout/retry approach
        if (attempt < maxRetries) {
          console.log(`💀⚠️  HARDCLOSE API: Attempt ${attempt} failed, trying alternative approach...`);
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          
          // Try again with extended timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          const retryResponse = await fetch('https://api.heygen.com/v1/streaming.stop', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'content-type': 'application/json',
              'x-api-key': apiKey
            },
            body: JSON.stringify({ session_id }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (retryResponse.ok) {
            const data = await retryResponse.json();
            console.log(`💀✅ HARDCLOSE API: Success on retry attempt ${attempt} for session ${session_id}`);
            return NextResponse.json({ 
              ...data, 
              hardclose: true, 
              attempt: `${attempt}-retry`,
              message: `Session forcefully closed on retry attempt ${attempt}`
            });
          }

          lastError = new Error(`Attempt ${attempt} failed: ${retryResponse.statusText}`);
        } else {
          lastError = new Error(`Final attempt ${attempt} failed: ${response.statusText}`);
        }

      } catch (error) {
        console.error(`💀❌ HARDCLOSE API: Attempt ${attempt} error for session ${session_id}:`, error);
        lastError = error;
        
        if (attempt < maxRetries) {
          // Wait before next attempt
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }

    // If all attempts failed, return the last error but with success for logging purposes
    console.error(`💀❌ HARDCLOSE API: All ${maxRetries} attempts failed for session ${session_id}`);
    
    // Sometimes sessions are actually closed even if API returns error
    // Return a partial success response for logging
    return NextResponse.json({ 
      error: 'All hardclose attempts failed',
      session_id,
      hardclose_attempted: true,
      attempts: maxRetries,
      last_error: lastError instanceof Error ? lastError.message : 'Unknown error',
      note: 'Session may still be closed despite API errors'
    }, { status: 207 }); // 207 Multi-Status - partial success

  } catch (error) {
    console.error('💀🚨 HARDCLOSE API: Critical error:', error);
    return NextResponse.json({ 
      error: 'HARDCLOSE failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 