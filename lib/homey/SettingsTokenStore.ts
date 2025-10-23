import { TokenStore } from '../panasonic/Provider';

type ManagerSettings = import('homey/manager/settings');

export interface SettingsTokenStoreOptions<T> {
  settings: ManagerSettings;
  key: string;
  /**
   * Invoked whenever a persistent storage interaction fails. The context string
   * contains the operation that failed ("get", "set", "unset", etc.).
   */
  onError?: (context: string, error: unknown) => void;
  /**
   * Allows callers to validate stored values. Returning `false` will cause the
   * value to be discarded and cleared from settings.
   */
  validate?: (value: unknown) => value is T;
}

const toError = (reason: unknown): Error => {
  if (reason instanceof Error) {
    return reason;
  }
  return new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
};

/**
 * TokenStore implementation backed by Homey's persistent settings manager.
 *
 * Homey SDK v3/v4 exposes the ManagerSettings manager for app level
 * persistence. Earlier builds of this project attempted to depend on the
 * undocumented `homey.storage` API which is unavailable when running the app
 * on Homey Cloud. This store is the supported replacement.
 */
export default class SettingsTokenStore<T> implements TokenStore<T> {
  private readonly settings: ManagerSettings;
  private readonly key: string;
  private readonly onError?: (context: string, error: unknown) => void;
  private readonly validate?: (value: unknown) => value is T;

  constructor(options: SettingsTokenStoreOptions<T>) {
    this.settings = options.settings;
    this.key = options.key;
    this.onError = options.onError;
    this.validate = options.validate;
  }

  async get(): Promise<T | null> {
    try {
      const value = this.settings.get(this.key);
      if (value === undefined || value === null) {
        return null;
      }

      if (this.validate && !this.validate(value)) {
        this.logError('get', new Error(`Invalid value detected for settings key "${this.key}"`));
        this.clearInvalidValue();
        return null;
      }

      return value as T;
    } catch (error) {
      this.logError('get', error);
      return null;
    }
  }

  async set(value: T): Promise<void> {
    try {
      // Clone the payload to ensure we only persist JSON serialisable content.
      const clone = JSON.parse(JSON.stringify(value)) as T;
      this.settings.set(this.key, clone as unknown as any);
    } catch (error) {
      this.logError('set', error);
      throw toError(error);
    }
  }

  async unset(): Promise<void> {
    try {
      this.settings.unset(this.key);
    } catch (error) {
      this.logError('unset', error);
    }
  }

  private clearInvalidValue(): void {
    try {
      this.settings.unset(this.key);
    } catch (error) {
      this.logError('clear', error);
    }
  }

  private logError(context: string, error: unknown): void {
    this.onError?.(context, error);
  }
}

