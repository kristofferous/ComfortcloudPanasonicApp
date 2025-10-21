import {
  ComfortDevice,
  ComfortDeviceFeatures,
  DeviceState,
  FanSpeed,
  SwingMode,
  ThermostatMode,
} from '../../types';

const MODE_MAP: Record<number, ThermostatMode> = {
  0: 'auto',
  1: 'heat',
  2: 'dry',
  3: 'cool',
  4: 'fan',
};

const MODE_REVERSE_MAP = Object.fromEntries(
  Object.entries(MODE_MAP).map(([key, value]) => [value, Number(key)]),
) as Record<ThermostatMode, number>;

const FAN_SPEED_MAP: Record<number, FanSpeed> = {
  0: 'auto',
  1: 'low',
  2: 'medium',
  3: 'high',
};

const FAN_SPEED_REVERSE_MAP = Object.fromEntries(
  Object.entries(FAN_SPEED_MAP).map(([key, value]) => [value, Number(key)]),
) as Record<FanSpeed, number>;

const DEFAULT_FAN_SPEEDS: FanSpeed[] = ['auto', 'low', 'medium', 'high'];

const clamp = (value: number, min?: number, max?: number): number => {
  if (typeof min === 'number') {
    value = Math.max(min, value);
  }
  if (typeof max === 'number') {
    value = Math.min(max, value);
  }
  return value;
};

export function mapDeviceFeatures(raw: Record<string, unknown> | undefined): ComfortDeviceFeatures {
  const minTemperature = typeof raw?.minTemp === 'number' ? raw?.minTemp : undefined;
  const maxTemperature = typeof raw?.maxTemp === 'number' ? raw?.maxTemp : undefined;
  const supportsHumidity = typeof raw?.insideHumidity === 'number';
  const supportsOutdoorTemperature = typeof raw?.outsideTemp === 'number' || typeof raw?.outTemp === 'number';
  const supportsEnergyMonitoring =
    typeof raw?.cumulativePower === 'number' || typeof raw?.instantPower === 'number' || typeof raw?.dayPower === 'number';
  const supportsSwingVertical = raw?.airSwingUD !== undefined;
  const supportsSwingHorizontal = raw?.airSwingLR !== undefined;

  let fanSpeeds = DEFAULT_FAN_SPEEDS;
  if (Array.isArray(raw?.supportedFanSpeeds)) {
    fanSpeeds = (raw?.supportedFanSpeeds as string[])
      .map((entry) => entry.toLowerCase() as FanSpeed)
      .filter((entry): entry is FanSpeed => DEFAULT_FAN_SPEEDS.includes(entry));
  }

  return {
    minTemperature,
    maxTemperature,
    fanSpeeds,
    supportsHumidity,
    supportsOutdoorTemperature,
    supportsEnergyMonitoring,
    supportsSwingVertical,
    supportsSwingHorizontal,
  };
}

export function mapDevice(raw: any): ComfortDevice {
  const features = mapDeviceFeatures(raw?.parameters ?? {});

  return {
    id: String(raw?.deviceGuid ?? raw?.id ?? raw?.deviceId ?? ''),
    name: String(raw?.deviceName ?? raw?.name ?? 'Panasonic AC'),
    groupId: raw?.groupId ? String(raw.groupId) : undefined,
    serialNumber: raw?.serialNumber ? String(raw.serialNumber) : undefined,
    model: raw?.modelNumber ? String(raw.modelNumber) : undefined,
    features,
    metadata: raw ?? {},
  };
}

export function mapDevicesFromResponse(raw: any): ComfortDevice[] {
  if (!raw) {
    return [];
  }

  const deviceList: any[] = Array.isArray(raw?.devices)
    ? raw.devices
    : Array.isArray(raw?.deviceList)
    ? raw.deviceList
    : [];

  const groupList: any[] = Array.isArray(raw?.groups) ? raw.groups : [];

  const flattenedDevices: any[] = [
    ...deviceList,
    ...groupList.flatMap((group) => Array.isArray(group?.devices) ? group.devices : []),
    ...(raw?.deviceGuid ? [raw] : []),
  ];

  return flattenedDevices.map(mapDevice);
}

export function mapThermostatMode(rawMode: unknown): ThermostatMode {
  if (typeof rawMode === 'string') {
    const normalized = rawMode.toLowerCase() as ThermostatMode;
    if (normalized in MODE_REVERSE_MAP) {
      return normalized;
    }
  }
  if (typeof rawMode === 'number' && rawMode in MODE_MAP) {
    return MODE_MAP[rawMode];
  }
  return 'auto';
}

export function mapFanSpeed(rawSpeed: unknown): FanSpeed | undefined {
  if (typeof rawSpeed === 'string') {
    const normalized = rawSpeed.toLowerCase() as FanSpeed;
    if (DEFAULT_FAN_SPEEDS.includes(normalized)) {
      return normalized;
    }
  }
  if (typeof rawSpeed === 'number' && rawSpeed in FAN_SPEED_MAP) {
    return FAN_SPEED_MAP[rawSpeed];
  }
  return undefined;
}

export function mapSwingMode(rawUd: unknown, rawLr: unknown): SwingMode | undefined {
  const ud = typeof rawUd === 'number' ? rawUd : undefined;
  const lr = typeof rawLr === 'number' ? rawLr : undefined;

  if (ud === 0 && lr === 0) {
    return 'off';
  }

  if ((ud !== undefined && ud > 0) && (lr !== undefined && lr > 0)) {
    return 'both';
  }

  if (ud !== undefined && ud > 0) {
    return 'vertical';
  }

  if (lr !== undefined && lr > 0) {
    return 'horizontal';
  }

  return undefined;
}

export function mapDeviceState(raw: any, device?: ComfortDevice): DeviceState {
  const parameters = raw?.parameters ?? raw ?? {};
  const features = device?.features ?? mapDeviceFeatures(parameters);

  const thermostatMode = mapThermostatMode(parameters?.operationMode ?? parameters?.mode);
  const fanSpeed = mapFanSpeed(parameters?.fanSpeed ?? parameters?.fan ?? parameters?.airVolume);
  const swingMode = mapSwingMode(parameters?.airSwingUD, parameters?.airSwingLR);
  const targetTemperatureRaw = typeof parameters?.targetTemp === 'number' ? parameters.targetTemp : parameters?.temperature;
  const targetTemperature = typeof targetTemperatureRaw === 'number'
    ? clamp(targetTemperatureRaw, features.minTemperature, features.maxTemperature)
    : features.minTemperature ?? 22;

  const state: DeviceState = {
    on: parameters?.operate === 1 || parameters?.power === 1 || parameters?.power === '1',
    thermostatMode,
    targetTemperature,
    minTemperature: features.minTemperature,
    maxTemperature: features.maxTemperature,
    indoorTemperature:
      typeof parameters?.insideTemp === 'number'
        ? parameters.insideTemp
        : typeof parameters?.roomTemperature === 'number'
        ? parameters.roomTemperature
        : undefined,
    indoorHumidity: typeof parameters?.insideHumidity === 'number' ? parameters.insideHumidity : undefined,
    outdoorTemperature:
      typeof parameters?.outsideTemp === 'number'
        ? parameters.outsideTemp
        : typeof parameters?.outTemp === 'number'
        ? parameters.outTemp
        : undefined,
    fanSpeed,
    swingMode,
    powerConsumption:
      typeof parameters?.instantPower === 'number'
        ? parameters.instantPower
        : typeof parameters?.currentPower === 'number'
        ? parameters.currentPower
        : undefined,
    energyConsumption: typeof parameters?.cumulativePower === 'number' ? parameters.cumulativePower : undefined,
    filterAlarm: parameters?.filterSign === 1 || parameters?.filterAlarm === true,
    connectionAlarm: parameters?.connectionAlarm === true || parameters?.errorStatus === 1,
    timestamp: Date.now(),
    raw: parameters,
  };

  return state;
}

export interface CapabilityPlan {
  capabilities: string[];
}

export function buildCapabilityPlan(device: ComfortDevice): CapabilityPlan {
  const capabilities = new Set<string>(['onoff', 'thermostat_mode', 'target_temperature', 'measure_temperature']);

  if (device.features.supportsHumidity) {
    capabilities.add('measure_humidity');
  }
  if (device.features.supportsOutdoorTemperature) {
    capabilities.add('measure_temperature_outdoor');
  }
  if (device.features.supportsEnergyMonitoring) {
    capabilities.add('measure_power');
    capabilities.add('meter_power');
  }
  if (device.features.fanSpeeds.length > 0) {
    capabilities.add('fan_speed');
  }
  if (device.features.supportsSwingVertical || device.features.supportsSwingHorizontal) {
    capabilities.add('swing_mode');
  }

  capabilities.add('measure_temperature');

  capabilities.add('thermostat_mode');

  if (device.features.supportsEnergyMonitoring) {
    capabilities.add('alarm_connection');
  }
  capabilities.add('alarm_filter');

  return { capabilities: Array.from(capabilities) };
}

export function createWritePayload(
  patch: Partial<DeviceState>,
  currentState: DeviceState | undefined,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (patch.on !== undefined) {
    payload.operate = patch.on ? 1 : 0;
  }

  if (patch.thermostatMode) {
    payload.operationMode = MODE_REVERSE_MAP[patch.thermostatMode];
  }

  if (patch.targetTemperature !== undefined) {
    const min = patch.minTemperature ?? currentState?.minTemperature;
    const max = patch.maxTemperature ?? currentState?.maxTemperature;
    payload.targetTemp = clamp(patch.targetTemperature, min, max);
  }

  if (patch.fanSpeed) {
    payload.fanSpeed = FAN_SPEED_REVERSE_MAP[patch.fanSpeed];
  }

  if (patch.swingMode) {
    switch (patch.swingMode) {
      case 'off':
        payload.airSwingUD = 0;
        payload.airSwingLR = 0;
        break;
      case 'vertical':
        payload.airSwingUD = 1;
        payload.airSwingLR = 0;
        break;
      case 'horizontal':
        payload.airSwingUD = 0;
        payload.airSwingLR = 1;
        break;
      case 'both':
        payload.airSwingUD = 1;
        payload.airSwingLR = 1;
        break;
      default:
        break;
    }
  }

  return payload;
}
