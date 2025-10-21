import { describe, expect, it } from 'vitest';
import { buildCapabilityPlan, createWritePayload, mapDevice, mapDeviceState } from '../lib/panasonic/Mappers';
import { ComfortDevice } from '../types';

describe('Mappers', () => {
  const rawDevice = {
    deviceGuid: 'abc123',
    deviceName: 'Living room',
    parameters: {
      minTemp: 16,
      maxTemp: 30,
      insideHumidity: 45,
      outsideTemp: 12,
      cumulativePower: 120.5,
      airSwingUD: 1,
      airSwingLR: 1,
      supportedFanSpeeds: ['auto', 'low', 'medium', 'high'],
    },
  };

  it('maps device metadata and features', () => {
    const device = mapDevice(rawDevice);
    expect(device.id).toBe('abc123');
    expect(device.name).toBe('Living room');
    expect(device.features.supportsHumidity).toBe(true);
    expect(device.features.supportsOutdoorTemperature).toBe(true);
    expect(device.features.supportsEnergyMonitoring).toBe(true);
    expect(device.features.fanSpeeds).toEqual(['auto', 'low', 'medium', 'high']);
  });

  it('maps device state from Comfort Cloud payload', () => {
    const device = mapDevice(rawDevice);
    const state = mapDeviceState(
      {
        parameters: {
          operate: 1,
          operationMode: 3,
          targetTemp: 22,
          insideTemp: 21.5,
          insideHumidity: 44,
          outsideTemp: 10,
          fanSpeed: 2,
          airSwingUD: 1,
          airSwingLR: 0,
          instantPower: 950,
          cumulativePower: 3.4,
          filterSign: 0,
          connectionAlarm: false,
        },
      },
      device,
    );

    expect(state.on).toBe(true);
    expect(state.thermostatMode).toBe('cool');
    expect(state.targetTemperature).toBe(22);
    expect(state.indoorTemperature).toBe(21.5);
    expect(state.indoorHumidity).toBe(44);
    expect(state.outdoorTemperature).toBe(10);
    expect(state.fanSpeed).toBe('medium');
    expect(state.swingMode).toBe('vertical');
    expect(state.powerConsumption).toBe(950);
    expect(state.energyConsumption).toBe(3.4);
  });

  it('builds capabilities based on features', () => {
    const device = mapDevice(rawDevice);
    const plan = buildCapabilityPlan(device as ComfortDevice);
    expect(plan.capabilities).toContain('measure_temperature.outdoor');
    expect(plan.capabilities).toContain('fan_speed');
    expect(plan.capabilities).toContain('meter_power');
  });

  it('creates write payload respecting bounds', () => {
    const current = mapDeviceState(
      {
        parameters: {
          operate: 1,
          operationMode: 0,
          targetTemp: 20,
        },
      },
      mapDevice(rawDevice),
    );

    const payload = createWritePayload(
      {
        on: false,
        thermostatMode: 'heat',
        targetTemperature: 40,
        fanSpeed: 'low',
        swingMode: 'both',
      },
      current,
    );

    expect(payload.operate).toBe(0);
    expect(payload.operationMode).toBeGreaterThanOrEqual(0);
    expect(payload.targetTemp).toBeLessThanOrEqual(30);
    expect(payload.fanSpeed).toBe(1);
    expect(payload.airSwingUD).toBe(1);
    expect(payload.airSwingLR).toBe(1);
  });
});
