import { NextResponse } from 'next/server';

enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

class SmartLogger {
  private static instance: SmartLogger;
  private logBuffer: Array<{timestamp: string, level: LogLevel, message: string, data?: any}> = [];
  private readonly maxBufferSize = 100; // Son 100 log'u tut
  private readonly isDevelopment = process.env.NODE_ENV === 'development';
  private readonly logLevel: LogLevel;

  constructor() {
    // Environment variable'dan log level belirle
    const envLogLevel = process.env.NEXT_PUBLIC_LOG_LEVEL?.toUpperCase();
    this.logLevel = this.isDevelopment 
      ? LogLevel.DEBUG  // Development'da varsayılan DEBUG
      : LogLevel.WARN;  // Production'da varsayılan WARN
    
    // Override if specific level set
    switch(envLogLevel) {
      case 'ERROR': this.logLevel = LogLevel.ERROR; break;
      case 'WARN': this.logLevel = LogLevel.WARN; break;
      case 'INFO': this.logLevel = LogLevel.INFO; break;
      case 'DEBUG': this.logLevel = LogLevel.DEBUG; break;
      case 'TRACE': this.logLevel = LogLevel.TRACE; break;
    }
  }

  static getInstance(): SmartLogger {
    if (!SmartLogger.instance) {
      SmartLogger.instance = new SmartLogger();
    }
    return SmartLogger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private addToBuffer(level: LogLevel, message: string, data?: any) {
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.logBuffer.shift(); // En eski log'u sil
    }
    
    this.logBuffer.push({
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      data
    });
  }

  error(message: string, data?: any) {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`🚨 [${new Date().toLocaleTimeString()}] ${message}`, data || '');
      this.addToBuffer(LogLevel.ERROR, message, data);
    }
  }

  warn(message: string, data?: any) {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`⚠️ [${new Date().toLocaleTimeString()}] ${message}`, data || '');
      this.addToBuffer(LogLevel.WARN, message, data);
    }
  }

  info(message: string, data?: any) {
    if (this.shouldLog(LogLevel.INFO)) {
      logger.debug(`ℹ️ [${new Date().toLocaleTimeString()}] ${message}`, data || '');
      this.addToBuffer(LogLevel.INFO, message, data);
    }
  }

  debug(message: string, data?: any) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      logger.debug(`🔍 [${new Date().toLocaleTimeString()}] ${message}`, data || '');
      this.addToBuffer(LogLevel.DEBUG, message, data);
    }
  }

  trace(message: string, data?: any) {
    if (this.shouldLog(LogLevel.TRACE)) {
      logger.debug(`🔬 [${new Date().toLocaleTimeString()}] ${message}`, data || '');
      this.addToBuffer(LogLevel.TRACE, message, data);
    }
  }

  // Log buffer'ını görüntüle (debugging için)
  showBuffer() {
    if (this.isDevelopment) {
      console.table(this.logBuffer);
    }
  }

  // Buffer'ı temizle
  clearBuffer() {
    this.logBuffer = [];
    if (this.isDevelopment) {
      logger.debug('🧹 Log buffer cleared');
    }
  }
}

// Global logger instance
const logger = SmartLogger.getInstance();
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

    logger.debug(`💀 HARDCLOSE API: Attempting to force close session ${session_id}`);

    // Retry logic for hardclose - try multiple times with different approaches
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`💀 HARDCLOSE API: Attempt ${attempt}/${maxRetries} for session ${session_id}`);

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
          logger.debug(`💀✅ HARDCLOSE API: Success on attempt ${attempt} for session ${session_id}`);
          return NextResponse.json({ 
            ...data, 
            hardclose: true, 
            attempt,
            message: `Session forcefully closed on attempt ${attempt}`
          });
        }

        // If regular stop fails, try with different timeout/retry approach
        if (attempt < maxRetries) {
          logger.debug(`💀⚠️  HARDCLOSE API: Attempt ${attempt} failed, trying alternative approach...`);
          
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
            logger.debug(`💀✅ HARDCLOSE API: Success on retry attempt ${attempt} for session ${session_id}`);
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