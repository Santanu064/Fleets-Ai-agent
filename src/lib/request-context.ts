/**
 * Production utilities: timeout wrappers, retry logic, safe parsing, structured logging.
 * These are used across the webhook pipeline to ensure reliability.
 */

// ─── Timeout Wrapper ────────────────────────────────────────────────────────────

export class TimeoutError extends Error {
  constructor(operationName: string, timeoutMs: number) {
    super(`[TIMEOUT] ${operationName} exceeded ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within `ms`,
 * it rejects with a TimeoutError. Optionally accepts an AbortController to
 * cancel the underlying operation (e.g., fetch).
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  operationName: string = "Operation"
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, ms));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (err) {
    clearTimeout(timeoutId!);
    throw err;
  }
}

// ─── Retry with Exponential Backoff ─────────────────────────────────────────────

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  operationName?: string;
}

/**
 * Retries an async function with exponential backoff.
 * Logs each retry attempt. Throws the last error if all retries fail.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 2,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    operationName = "Operation",
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        console.warn(
          `[Retry] ${operationName} attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[Retry] ${operationName} failed after ${maxRetries + 1} attempts`);
  throw lastError;
}

// ─── Safe JSON Parsing ──────────────────────────────────────────────────────────

/**
 * Safely parses a JSON string, returning null instead of throwing on malformed input.
 */
export function safeJsonParse<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─── Structured Logger ──────────────────────────────────────────────────────────

export interface LogContext {
  requestId?: string;
  phone?: string;
  conversationId?: string;
  wamid?: string;
  [key: string]: unknown;
}

/**
 * Structured logger that attaches context (request ID, phone, etc.) to every log.
 * Makes it easy to trace a single driver's message through the entire pipeline.
 */
export function createLogger(context: LogContext = {}) {
  const prefix = context.requestId
    ? `[req:${context.requestId}]`
    : "[webhook]";

  const formatCtx = () => {
    const parts: string[] = [];
    if (context.phone) parts.push(`phone=${context.phone}`);
    if (context.wamid) parts.push(`wamid=${context.wamid?.slice(-8)}`);
    if (context.conversationId) parts.push(`convo=${context.conversationId.slice(0, 8)}`);
    return parts.length > 0 ? ` (${parts.join(", ")})` : "";
  };

  return {
    info: (message: string, data?: Record<string, unknown>) => {
      console.info(`${prefix}${formatCtx()} ${message}`, data ?? "");
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      console.warn(`${prefix}${formatCtx()} ${message}`, data ?? "");
    },
    error: (message: string, err?: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err ?? "");
      console.error(`${prefix}${formatCtx()} ${message}`, errMsg);
    },
    /** Create a child logger with additional context fields */
    child: (extra: LogContext) => createLogger({ ...context, ...extra }),
  };
}

/**
 * Generate a short unique request ID for tracing (8 chars hex).
 */
export function generateRequestId(): string {
  return Math.random().toString(16).slice(2, 10);
}
