const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

export async function POST() {
  try {
    if (!HEYGEN_API_KEY) {
      throw new Error("API key is missing from .env");
    }
    const baseApiUrl = process.env.NEXT_PUBLIC_BASE_API_URL;

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const res = await fetch(`${baseApiUrl}/v1/streaming.create_token`, {
      method: "POST",
      headers: {
        "x-api-key": HEYGEN_API_KEY,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log("Response:", res);

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();

    return new Response(data.data.token, {
      status: 200,
    });
  } catch (error) {
    console.error("Error retrieving access token:", error);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error("Request timed out after 5 seconds");
        return new Response("Request timeout - please check your internet connection", {
          status: 408,
        });
      }
      
      if (error.message.includes('fetch failed') || error.message.includes('ConnectTimeoutError')) {
        console.error("Network connection failed");
        return new Response("Network connection failed - please check your internet connection", {
          status: 503,
        });
      }
    }

    return new Response("Failed to retrieve access token", {
      status: 500,
    });
  }
}
