import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { AuthTokens, ComfortDevice, DeviceState, ProviderLoginRequest } from '../../types';
import { createWritePayload, mapDeviceState, mapDevicesFromResponse } from './Mappers';
import { CredentialsClient, Provider } from './Provider';
import RateLimiter from './RateLimiter';

const DEFAULT_BASE_URL = 'https://accsmart.panasonic.com';
const DEFAULT_APP_VERSION = '1.19.0';
const DEFAULT_USER_AGENT = `HomeyPanasonicComfortCloud/${DEFAULT_APP_VERSION}`;

interface LoginResponse {
  uToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  expires_in?: number;
  userId?: string;
  user?: {
    id?: string;
  };
}

interface RefreshResponse extends LoginResponse {}

interface ListDevicesResponse {
  groups?: any[];
  devices?: any[];
  deviceList?: any[];
}

interface DeviceStatusResponse {
  deviceGuid?: string;
  parameters?: Record<string, unknown>;
}

export interface ComfortCloudClientOptions {
  rateLimiter: RateLimiter;
  credentialsClient: CredentialsClient;
  logger?: (message: string, ...args: unknown[]) => void;
  debug?: boolean;
  baseUrl?: string;
  userAgent?: string;
}

interface RequestOptions {
  requiresAuth?: boolean;
  attempt?: number;
}

const delay = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ComfortCloudClient implements Provider {
  private readonly http: AxiosInstance;
  private tokens: AuthTokens | null = null;
  private tokensLoaded = false;
  private readonly rateLimiter: RateLimiter;
  private readonly credentialsClient: CredentialsClient;
  private readonly logger?: (message: string, ...args: unknown[]) => void;
  private readonly debug: boolean;
  private readonly stateCache = new Map<string, DeviceState>();

  constructor(options: ComfortCloudClientOptions) {
    this.rateLimiter = options.rateLimiter;
    this.credentialsClient = options.credentialsClient;
    this.logger = options.logger;
    this.debug = Boolean(options.debug);

    this.http = axios.create({
      baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
      timeout: 20000,
      headers: {
        'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
        'Content-Type': 'application/json',
        'X-APP-VERSION': DEFAULT_APP_VERSION,
        'X-App-Type': '1',
        'Accept': 'application/json',
      },
    });
  }

  async login(credentials: ProviderLoginRequest): Promise<AuthTokens> {
    const response = await this.request<LoginResponse>(
      {
        url: '/auth/login',
        method: 'POST',
        data: {
          id: credentials.email,
          password: credentials.password,
        },
      },
      { requiresAuth: false },
    );

    const tokens = this.parseTokens(response);
    await this.setTokens(tokens);
    this.logDebug('Authenticated Comfort Cloud account %s', tokens.userId);
    return tokens;
  }

  async refresh(tokens: AuthTokens): Promise<AuthTokens> {
    const response = await this.request<RefreshResponse>(
      {
        url: '/auth/token',
        method: 'POST',
        data: {
          refreshToken: tokens.refreshToken,
        },
      },
      { requiresAuth: false },
    );

    const nextTokens = this.parseTokens(response, tokens);
    await this.setTokens(nextTokens);
    this.logDebug('Refreshed Comfort Cloud token');
    return nextTokens;
  }

  async listDevices(): Promise<ComfortDevice[]> {
    await this.ensureAuthenticated();
    const response = await this.request<ListDevicesResponse>({
      url: '/device/group',
      method: 'GET',
    });
    return mapDevicesFromResponse(response);
  }

  async readState(deviceId: string): Promise<DeviceState> {
    await this.ensureAuthenticated();
    const response = await this.request<DeviceStatusResponse>({
      url: `/deviceStatus/${encodeURIComponent(deviceId)}`,
      method: 'GET',
    });
    const state = mapDeviceState(response);
    this.stateCache.set(deviceId, state);
    return state;
  }

  async writeState(deviceId: string, patch: Partial<DeviceState>): Promise<DeviceState> {
    await this.ensureAuthenticated();
    const currentState = this.stateCache.get(deviceId);
    const payload = createWritePayload(patch, currentState);

    await this.request({
      url: '/deviceStatus/control',
      method: 'POST',
      data: {
        deviceGuid: deviceId,
        parameters: payload,
      },
    });

    // Fetch updated state to ensure we have the latest values and respect server-side validation.
    const updated = await this.readState(deviceId);
    return updated;
  }

  private async request<T>(config: AxiosRequestConfig, options: RequestOptions = {}): Promise<T> {
    const { requiresAuth = true, attempt = 0 } = options;
    const headers = { ...(config.headers ?? {}) };

    if (requiresAuth) {
      const tokens = await this.ensureAuthenticated();
      headers['X-User-Authorization'] = tokens.accessToken;
    }

    return this.rateLimiter.schedule(async () => {
      try {
        const response = await this.http.request<T>({
          ...config,
          headers,
        });
        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const method = String(config.method ?? 'GET').toUpperCase();
        const url = String(config.url ?? 'unknown');
        this.logError(
          'Request %s %s failed (%s): %s',
          method,
          url,
          status ?? 'unknown',
          axiosError.message,
        );

        if (status === 401 && requiresAuth && attempt < 2) {
          this.logDebug('Request %s %s unauthorized, attempting token refresh', method, url);
          await this.handleUnauthorized();
          return this.request<T>(config, { requiresAuth, attempt: attempt + 1 });
        }

        if ((status === 429 || (status ?? 0) >= 500) && attempt < 4) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 15000);
          this.logDebug('Request %s %s rate limited, retrying in %dms', method, url, backoff);
          await delay(backoff);
          return this.request<T>(config, { requiresAuth, attempt: attempt + 1 });
        }

        throw error;
      }
    });
  }

  private async ensureAuthenticated(): Promise<AuthTokens> {
    const tokens = await this.getTokens();
    if (!tokens) {
      throw new Error('Comfort Cloud credentials missing');
    }

    const expiresSoon = tokens.expiresAt - Date.now() < 60 * 1000;
    if (expiresSoon) {
      return this.refresh(tokens);
    }

    return tokens;
  }

  private async getTokens(): Promise<AuthTokens | null> {
    if (!this.tokensLoaded) {
      this.tokens = await this.credentialsClient.getTokens();
      this.tokensLoaded = true;
    }
    return this.tokens;
  }

  private async setTokens(tokens: AuthTokens | null): Promise<void> {
    this.tokens = tokens;
    this.tokensLoaded = true;
    if (tokens) {
      await this.credentialsClient.setTokens(tokens);
    } else {
      await this.credentialsClient.clearTokens();
    }
  }

  private parseTokens(response: LoginResponse, previous?: AuthTokens): AuthTokens {
    const accessToken = response.uToken ?? response.accessToken;
    const refreshToken = response.refreshToken ?? previous?.refreshToken;
    if (!accessToken || !refreshToken) {
      throw new Error('Comfort Cloud authentication failed');
    }

    const expiresIn = response.expiresIn ?? response.expires_in ?? 3600;
    const userId = response.userId ?? response.user?.id ?? previous?.userId ?? 'unknown';
    return {
      accessToken,
      refreshToken,
      userId,
      expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
    };
  }

  private async handleUnauthorized(): Promise<void> {
    const tokens = await this.getTokens();
    if (!tokens) {
      throw new Error('Comfort Cloud tokens unavailable');
    }
    await this.refresh(tokens);
  }

  private logDebug(message: string, ...args: unknown[]): void {
    if (this.debug) {
      this.logger?.(this.formatLog(message), ...args);
    }
  }

  private logError(message: string, ...args: unknown[]): void {
    this.logger?.(this.formatLog(message), ...args);
  }

  private formatLog(message: string): string {
    return `[ComfortCloudClient] ${message}`;
  }
}

export default ComfortCloudClient;
