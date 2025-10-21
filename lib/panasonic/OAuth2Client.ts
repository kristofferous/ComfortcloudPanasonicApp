import { AuthTokens, ComfortDevice, DeviceState, ProviderLoginRequest } from '../../types';
import { Provider } from './Provider';

/**
 * Placeholder for a potential future OAuth2 based integration if Panasonic exposes official APIs.
 * The current Comfort Cloud platform only provides credential-based authentication, so this class simply
 * throws informative errors when used.
 */
export class OAuth2Client implements Provider {
  async login(_credentials: ProviderLoginRequest): Promise<AuthTokens> {
    throw new Error('OAuth2 flow is not implemented for Panasonic Comfort Cloud.');
  }

  async refresh(_tokens: AuthTokens): Promise<AuthTokens> {
    throw new Error('OAuth2 flow is not implemented for Panasonic Comfort Cloud.');
  }

  async listDevices(): Promise<ComfortDevice[]> {
    throw new Error('OAuth2 flow is not implemented for Panasonic Comfort Cloud.');
  }

  async readState(_deviceId: string): Promise<DeviceState> {
    throw new Error('OAuth2 flow is not implemented for Panasonic Comfort Cloud.');
  }

  async writeState(_deviceId: string, _patch: Partial<DeviceState>): Promise<DeviceState> {
    throw new Error('OAuth2 flow is not implemented for Panasonic Comfort Cloud.');
  }
}

export default OAuth2Client;
