export interface RateLimiterOptions {
  maxConcurrent?: number;
  minInterval?: number;
  maxQueueSize?: number;
  logger?: (message: string, ...args: unknown[]) => void;
}

interface QueueItem {
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * Minimal rate limiter with configurable concurrency and delay between tasks.
 */
export class RateLimiter {
  private readonly maxConcurrent: number;
  private readonly minInterval: number;
  private readonly maxQueueSize?: number;
  private readonly logger?: (message: string, ...args: unknown[]) => void;
  private readonly queue: QueueItem[] = [];
  private activeCount = 0;
  private lastStart = 0;

  constructor(options: RateLimiterOptions = {}) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);
    this.minInterval = Math.max(0, options.minInterval ?? 200);
    this.maxQueueSize = options.maxQueueSize;
    this.logger = options.logger;
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    if (this.maxQueueSize && this.queue.length >= this.maxQueueSize) {
      throw new Error('Rate limiter queue full');
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn,
        resolve: (value: unknown) => resolve(value as T),
        reject,
      });
      this.process();
    });
  }

  private process(): void {
    if (!this.queue.length) {
      return;
    }

    if (this.activeCount >= this.maxConcurrent) {
      return;
    }

    const now = Date.now();
    const wait = Math.max(0, this.minInterval - (now - this.lastStart));
    if (wait > 0) {
      setTimeout(() => this.process(), wait);
      return;
    }

    const item = this.queue.shift();
    if (!item) {
      return;
    }

    this.activeCount += 1;
    this.lastStart = Date.now();

    item.fn()
      .then((result) => {
        item.resolve(result);
      })
      .catch((error) => {
        item.reject(error);
      })
      .finally(() => {
        this.activeCount -= 1;
        this.process();
      });
  }
}

export default RateLimiter;
