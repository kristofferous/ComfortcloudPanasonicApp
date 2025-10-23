import Homey from 'homey';
import ComfortCloudClient from './lib/panasonic/ComfortCloudClient';
import RateLimiter from './lib/panasonic/RateLimiter';
import SettingsTokenStore from './lib/homey/SettingsTokenStore';
import { CredentialsClient, StorageCredentialsClient, TokenStore } from './lib/panasonic/Provider';
import { PollIntervalConfig, AuthTokens } from './types';

interface StoredCredentials {
  email?: string;
  password?: string;
}

type LegacyStorageManager = {
  getStore<T = unknown>(name: string): TokenStore<T>;
};

function createInMemoryTokenStore<T>(): TokenStore<T> {
  let value: T | null = null;

  return {
    async get() {
      return value;
    },
    async set(next: T) {
      value = next;
    },
    async unset() {
      value = null;
    },
  } satisfies TokenStore<T>;
}

export default class PanasonicComfortCloudApp extends Homey.App {
  private rateLimiter!: RateLimiter;
  private credentialsClient!: CredentialsClient;
  private credentialStore!: TokenStore<StoredCredentials>;

  async onInit(): Promise<void> {
    this.rateLimiter = new RateLimiter({
      maxConcurrent: 2,
      minInterval: 400,
      logger: (message, ...args) => this.log(message, ...args),
    });

    const tokenStore = this.createPersistentTokenStore<AuthTokens>(
      'comfortcloud.tokens',
      this.isAuthTokens,
    );
    await this.migrateLegacyStore('comfortcloud.tokens', tokenStore);
    this.credentialsClient = new StorageCredentialsClient(tokenStore);

    this.credentialStore = this.createPersistentTokenStore<StoredCredentials>(
      'comfortcloud.credentials',
      this.isStoredCredentials,
    );
    await this.migrateLegacyStore('comfortcloud.credentials', this.credentialStore);

    await this.bootstrapSettings();

    this.homey.settings.on('set', async (key) => {
      try {
        await this.handleSettingChanged(key);
      } catch (error) {
        this.error(
          '[app.ts] handleSettingChanged("%s") failed: %s',
          key,
          (error as Error).message,
        );
      }
    });

    this.log('Panasonic Comfort Cloud app initialized');
  }

  createClient(options: { debug?: boolean } = {}): ComfortCloudClient {
    return new ComfortCloudClient({
      rateLimiter: this.rateLimiter,
      credentialsClient: this.credentialsClient,
      logger: (message, ...args) => this.log(message, ...args),
      debug: options.debug ?? this.isDebugLoggingEnabled(),
    });
  }

  getCredentialsClient(): CredentialsClient {
    return this.credentialsClient;
  }

  async getStoredCredentials(): Promise<StoredCredentials | null> {
    return (await this.credentialStore.get()) ?? null;
  }

  async setStoredCredentials(credentials: StoredCredentials): Promise<void> {
    try {
      if (!credentials.email && !credentials.password) {
        await this.credentialStore.unset();
        return;
      }
      await this.credentialStore.set(credentials);
    } catch (error) {
      this.error('[app.ts] setStoredCredentials failed: %s', (error as Error).message);
      throw (error instanceof Error ? error : new Error(String(error)));
    }
  }

  getPollIntervals(): PollIntervalConfig {
    const essentialSeconds = Number(this.homey.settings.get('pollEssential')) || 75;
    const environmentSeconds = Number(this.homey.settings.get('pollEnvironment')) || 120;
    const extendedMinutes = Number(this.homey.settings.get('pollExtended')) || 15;

    return {
      essential: essentialSeconds * 1000,
      environment: environmentSeconds * 1000,
      extended: extendedMinutes * 60 * 1000,
    };
  }

  isDebugLoggingEnabled(): boolean {
    return Boolean(this.homey.settings.get('debugLogging'));
  }

  private async handleSettingChanged(key: string): Promise<void> {
    switch (key) {
      case 'accountEmail':
      case 'accountPassword':
        await this.persistCredentials();
        break;
      case 'rescanDevices':
        await this.handleRescanRequest();
        break;
      default:
        break;
    }
  }

  private async bootstrapSettings(): Promise<void> {
    const defaults: Array<[string, number]> = [
      ['pollEssential', 75],
      ['pollEnvironment', 120],
      ['pollExtended', 15],
    ];
    for (const [key, value] of defaults) {
      if (this.homey.settings.get(key) === undefined || this.homey.settings.get(key) === null) {
        this.homey.settings.set(key, value);
      }
    }
  }

  private async persistCredentials(): Promise<void> {
    const existing = (await this.getStoredCredentials()) ?? {};
    const emailValue = this.homey.settings.get('accountEmail');
    const passwordValue = this.homey.settings.get('accountPassword');

    const next: StoredCredentials = { ...existing };
    if (typeof emailValue === 'string') {
      if (emailValue.trim().length > 0) {
        next.email = emailValue.trim();
      } else {
        delete next.email;
      }
    }

    if (typeof passwordValue === 'string' && passwordValue.length > 0) {
      next.password = passwordValue;
      setTimeout(() => {
        try {
          this.homey.settings.set('accountPassword', '');
        } catch (error) {
          this.error('[app.ts] persistCredentials -> clear password failed: %s', (error as Error).message);
        }
      }, 0);
    }

    try {
      await this.setStoredCredentials(next);
    } catch (error) {
      this.error('[app.ts] persistCredentials -> setStoredCredentials failed: %s', (error as Error).message);
    }
  }

  private async handleRescanRequest(): Promise<void> {
    const driver = this.homey.drivers?.getDriver('panasonic-ac') as unknown as {
      rescanDevices?: () => Promise<void>;
    };

    if (driver?.rescanDevices) {
      try {
        await driver.rescanDevices();
      } catch (error) {
        this.error('[app.ts] handleRescanRequest -> rescanDevices failed: %s', (error as Error).message);
      }
    }

    // Reset the button state to avoid repeated triggers.
    setTimeout(() => {
      try {
        this.homey.settings.unset('rescanDevices');
      } catch (error) {
        this.error('[app.ts] handleRescanRequest -> reset toggle failed: %s', (error as Error).message);
      }
    }, 0);
  }

  private createPersistentTokenStore<T>(
    name: string,
    validate?: (value: unknown) => value is T,
  ): TokenStore<T> {
    const settings = this.homey.settings;
    if (!settings) {
      this.error(
        '[app.ts] createPersistentTokenStore("%s") unavailable: Homey settings manager missing. Falling back to in-memory store.',
        name,
      );
      return createInMemoryTokenStore<T>();
    }

    return new SettingsTokenStore<T>({
      settings,
      key: name,
      validate,
      onError: (context, error) => {
        this.error(
          '[app.ts] SettingsTokenStore("%s").%s failed: %s',
          name,
          context,
          (error instanceof Error ? error.message : String(error)),
        );
      },
    });
  }

  private async migrateLegacyStore<T>(name: string, target: TokenStore<T>): Promise<void> {
    const storageManager = (this.homey as { storage?: LegacyStorageManager }).storage;
    if (!storageManager?.getStore) {
      return;
    }

    try {
      const legacyStore = storageManager.getStore<T>(name);
      const value = await legacyStore.get();
      if (value === null || value === undefined) {
        return;
      }

      await target.set(value);
      await legacyStore.unset();
      this.log('[app.ts] Migrated legacy storage store "%s" to Homey settings', name);
    } catch (error) {
      this.error('[app.ts] migrateLegacyStore("%s") failed: %s', name, (error as Error).message);
    }
  }

  private isAuthTokens(value: unknown): value is AuthTokens {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Partial<AuthTokens>;
    return (
      typeof candidate.accessToken === 'string' &&
      typeof candidate.refreshToken === 'string' &&
      typeof candidate.expiresAt === 'number' &&
      typeof candidate.userId === 'string'
    );
  }

  private isStoredCredentials(value: unknown): value is StoredCredentials {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as StoredCredentials;
    const emailValid =
      candidate.email === undefined || typeof candidate.email === 'string';
    const passwordValid =
      candidate.password === undefined || typeof candidate.password === 'string';
    return emailValid && passwordValid;
  }
}

module.exports = PanasonicComfortCloudApp;
