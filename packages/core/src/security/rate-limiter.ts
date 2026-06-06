/**
 * Simple in-memory rate limiter for expensive MCP tool operations.
 * Limits concurrent executions and per-minute call rate.
 */
export class RateLimiter {
  private activeCount = 0;
  private callTimestamps: number[] = [];

  constructor(
    private maxConcurrent: number = 3,
    private maxPerMinute: number = 30
  ) {}

  /**
   * Attempt to acquire a slot. Returns true if allowed, false if rate-limited.
   */
  tryAcquire(): boolean {
    const now = Date.now();

    this.callTimestamps = this.callTimestamps.filter((t) => now - t < 60_000);

    if (this.activeCount >= this.maxConcurrent) {
      return false;
    }

    if (this.callTimestamps.length >= this.maxPerMinute) {
      return false;
    }

    this.activeCount++;
    this.callTimestamps.push(now);
    return true;
  }

  /**
   * Release a slot after operation completes.
   */
  release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  /**
   * Execute a function with rate limiting. Throws if rate-limited.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.tryAcquire()) {
      throw new RateLimitError();
    }
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export class RateLimitError extends Error {
  constructor() {
    super('Rate limited: too many concurrent or frequent requests');
    this.name = 'RateLimitError';
  }
}
