import { describe, expect, it, vi } from 'vitest';
import PollScheduler from '../polling/PollScheduler';

describe('PollScheduler', () => {
  it('runs tasks at configured intervals and updates interval', async () => {
    vi.useFakeTimers();
    const scheduler = new PollScheduler();
    const runSpy = vi.fn();

    scheduler.register({
      id: 'test',
      interval: 1000,
      run: async () => {
        runSpy();
      },
      immediate: true,
    });

    scheduler.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(runSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(runSpy).toHaveBeenCalledTimes(2);

    scheduler.updateInterval('test', 2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(runSpy).toHaveBeenCalledTimes(3);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runSpy).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('handles task exceptions without stopping other runs', async () => {
    vi.useFakeTimers();
    const scheduler = new PollScheduler();
    const spy = vi.fn();
    let shouldThrow = true;

    scheduler.register({
      id: 'task',
      interval: 500,
      immediate: true,
      run: async () => {
        if (shouldThrow) {
          shouldThrow = false;
          throw new Error('boom');
        }
        spy();
      },
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(spy).toHaveBeenCalledTimes(1);
    scheduler.stop();
    vi.useRealTimers();
  });
});
