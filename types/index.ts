export type ThermostatMode = 'auto' | 'cool' | 'heat' | 'dry' | 'fan';
export type FanSpeed = 'auto' | 'low' | 'medium' | 'high';
export type SwingMode = 'off' | 'vertical' | 'horizontal' | 'both';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch millis */
  expiresAt: number;
  userId: string;
}

export interface ComfortDeviceFeatures {
  minTemperature?: number;
  maxTemperature?: number;
  fanSpeeds: FanSpeed[];
  supportsHumidity: boolean;
  supportsOutdoorTemperature: boolean;
  supportsEnergyMonitoring: boolean;
  supportsSwingVertical: boolean;
  supportsSwingHorizontal: boolean;
}

export interface ComfortDevice {
  id: string;
  name: string;
  groupId?: string;
  serialNumber?: string;
  model?: string;
  features: ComfortDeviceFeatures;
  metadata?: Record<string, unknown>;
}

export interface DeviceState {
  on: boolean;
  thermostatMode: ThermostatMode;
  targetTemperature: number;
  minTemperature?: number;
  maxTemperature?: number;
  indoorTemperature?: number;
  indoorHumidity?: number;
  outdoorTemperature?: number;
  fanSpeed?: FanSpeed;
  swingMode?: SwingMode;
  powerConsumption?: number;
  energyConsumption?: number;
  filterAlarm?: boolean;
  connectionAlarm?: boolean;
  timestamp: number;
  raw?: Record<string, unknown>;
}

export interface ComfortCloudDeviceSummaryResponse {
  id: string;
  deviceGuid: string;
  deviceName: string;
  parameters?: Record<string, unknown>;
}

export interface ComfortCloudDeviceDetailResponse {
  deviceGuid: string;
  deviceName: string;
  parameters: Record<string, unknown>;
}

export interface ComfortCloudStatusResponse {
  deviceGuid: string;
  parameters: Record<string, unknown>;
}

export interface PollIntervalConfig {
  essential: number;
  environment: number;
  extended: number;
}

export interface CapabilityChange {
  capability: string;
  value: unknown;
}

export interface ProviderLoginRequest {
  email: string;
  password: string;
}
