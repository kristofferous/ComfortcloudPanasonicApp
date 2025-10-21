import { AuthTokens, ComfortDevice, DeviceState, ProviderLoginRequest } from '../../types';

export interface Provider {
  login(credentials: ProviderLoginRequest): Promise<AuthTokens>;
  refresh(tokens: AuthTokens): Promise<AuthTokens>;
  listDevices(): Promise<ComfortDevice[]>;
  readState(deviceId: string): Promise<DeviceState>;
  writeState(deviceId: string, patch: Partial<DeviceState>): Promise<DeviceState>;
}

export interface CredentialsClient {
  getTokens(): Promise<AuthTokens | null>;
  setTokens(tokens: AuthTokens): Promise<void>;
  clearTokens(): Promise<void>;
}

export interface TokenStore<T> {
  get(): Promise<T | null>;
  set(value: T): Promise<void>;
  unset(): Promise<void>;
}

export class StorageCredentialsClient implements CredentialsClient {
  constructor(private readonly store: TokenStore<AuthTokens>) {}

  async getTokens(): Promise<AuthTokens | null> {
    return this.store.get();
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    await this.store.set(tokens);
  }

  async clearTokens(): Promise<void> {
    await this.store.unset();
  }
}

export interface ProviderFactoryOptions {
  credentialsClient: CredentialsClient;
}
