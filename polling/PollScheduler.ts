export interface PollTask {
  id: string;
  interval: number; // milliseconds
  run: () => Promise<void> | void;
  immediate?: boolean;
}

export interface PollSchedulerOptions {
  logger?: (message: string, ...args: unknown[]) => void;
  jitter?: number;
}

interface ScheduledTask extends PollTask {
  timeout?: NodeJS.Timeout;
  lastRun?: number;
}

/**
 * Simple scheduler that runs asynchronous poll tasks with independent intervals.
 * Each task is scheduled using setTimeout which allows us to change the interval dynamically
 * and to stop the scheduler completely without leaking timers.
 */
export class PollScheduler {
  private readonly tasks = new Map<string, ScheduledTask>();
  private readonly logger?: (message: string, ...args: unknown[]) => void;
  private readonly jitter: number;
  private running = false;

  constructor(options: PollSchedulerOptions = {}) {
    this.logger = options.logger;
    this.jitter = options.jitter ?? 0;
  }

  register(task: PollTask): void {
    if (this.tasks.has(task.id)) {
      throw new Error(`Poll task with id "${task.id}" already registered`);
    }

    const state: ScheduledTask = { ...task };
    this.tasks.set(task.id, state);

    if (this.running) {
      this.schedule(state, task.immediate ?? true);
    }
  }

  updateInterval(id: string, interval: number): void {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Unknown poll task: ${id}`);
    }

    task.interval = interval;
    if (this.running) {
      this.clearTimeout(task);
      this.schedule(task, false);
    }
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    for (const task of this.tasks.values()) {
      this.schedule(task, task.immediate ?? true);
    }
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    for (const task of this.tasks.values()) {
      this.clearTimeout(task);
    }
  }

  unregister(id: string): void {
    const task = this.tasks.get(id);
    if (!task) {
      return;
    }

    this.clearTimeout(task);
    this.tasks.delete(id);
  }

  private schedule(task: ScheduledTask, immediate: boolean): void {
    if (!this.running) {
      return;
    }

    const delay = immediate ? 0 : this.calculateDelay(task.interval);
    task.timeout = setTimeout(async () => {
      await this.execute(task);
    }, delay);
  }

  private async execute(task: ScheduledTask): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      task.lastRun = Date.now();
      await task.run();
    } catch (error) {
      this.logger?.('[PollScheduler.ts] Poll task "%s" failed: %s', task.id, (error as Error).message);
    } finally {
      if (this.running) {
        this.schedule(task, false);
      }
    }
  }

  private calculateDelay(interval: number): number {
    if (this.jitter <= 0) {
      return interval;
    }

    const jitterValue = Math.floor(Math.random() * this.jitter);
    return interval + jitterValue;
  }

  private clearTimeout(task: ScheduledTask): void {
    if (task.timeout) {
      clearTimeout(task.timeout);
      task.timeout = undefined;
    }
  }
}

export default PollScheduler;
