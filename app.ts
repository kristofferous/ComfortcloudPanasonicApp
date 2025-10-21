import Homey from 'homey';
import ComfortCloudClient from './lib/panasonic/ComfortCloudClient';
import RateLimiter from './lib/panasonic/RateLimiter';
import { CredentialsClient, StorageCredentialsClient, TokenStore } from './lib/panasonic/Provider';
import { PollIntervalConfig, AuthTokens } from './types';

interface StoredCredentials {
  email?: string;
  password?: string;
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

    const storageManager = (this.homey as any).storage;
    const tokenStore = storageManager.getStore('comfortcloud.tokens') as TokenStore<AuthTokens>;
    this.credentialsClient = new StorageCredentialsClient(tokenStore);
    this.credentialStore = storageManager.getStore('comfortcloud.credentials') as TokenStore<StoredCredentials>;

    await this.bootstrapSettings();

    this.homey.settings.on('set', async (key) => {
      await this.handleSettingChanged(key);
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
    if (!credentials.email && !credentials.password) {
      await this.credentialStore.unset();
      return;
    }
    await this.credentialStore.set(credentials);
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
        this.homey.settings.set('accountPassword', '');
      }, 0);
    }

    await this.setStoredCredentials(next);
  }

  private async handleRescanRequest(): Promise<void> {
    const driver = this.homey.drivers?.getDriver('panasonic-ac') as unknown as {
      rescanDevices?: () => Promise<void>;
    };

    if (driver?.rescanDevices) {
      await driver.rescanDevices();
    }

    // Reset the button state to avoid repeated triggers.
    setTimeout(() => {
      this.homey.settings.unset('rescanDevices');
    }, 0);
  }
}

module.exports = PanasonicComfortCloudApp;
