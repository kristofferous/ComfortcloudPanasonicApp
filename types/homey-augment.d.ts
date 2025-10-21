import 'homey';

declare module 'homey' {
  interface Homey {
    storage: HomeyStorageManager;
  }

  interface HomeyStorageManager {
    getStore<T = unknown>(name: string): HomeyStorage<T>;
  }

  interface HomeyStorage<T = unknown> {
    get(): Promise<T | null>;
    set(value: T): Promise<void>;
    unset(): Promise<void>;
  }
}
