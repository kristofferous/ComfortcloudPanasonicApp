import Homey from 'homey';
import ComfortCloudClient from '../../lib/panasonic/ComfortCloudClient';
import { buildCapabilityPlan } from '../../lib/panasonic/Mappers';
import PollScheduler from '../../polling/PollScheduler';
import {
  DeviceState,
  FanSpeed,
  SwingMode,
  ThermostatMode,
  ComfortDeviceFeatures,
} from '../../types';
import type PanasonicComfortCloudApp from '../../app';
import type PanasonicAcDriver from './driver';

export class PanasonicAcDevice extends Homey.Device {
  private client!: ComfortCloudClient;
  private pollScheduler?: PollScheduler;
  private lastState?: DeviceState;
  private polling = false;
  private features: ComfortDeviceFeatures = {
    fanSpeeds: ['auto', 'low', 'medium', 'high'],
    supportsHumidity: false,
    supportsOutdoorTemperature: false,
    supportsEnergyMonitoring: false,
    supportsSwingVertical: false,
    supportsSwingHorizontal: false,
  };

  async onInit(): Promise<void> {
    const app = this.homey.app as PanasonicComfortCloudApp;
    this.client = app.createClient();

    try {
      const storedFeatures = (await this.getStoreValue('features')) as ComfortDeviceFeatures | null;
      if (storedFeatures) {
        this.features = { ...this.features, ...storedFeatures };
      }
    } catch (error) {
      this.error('[device.ts] onInit -> getStoreValue("features") failed: %s', (error as Error).message);
    }

    try {
      await this.ensureCapabilities();
    } catch (error) {
      this.error('[device.ts] onInit -> ensureCapabilities failed: %s', (error as Error).message);
      throw error;
    }
    this.registerCapabilityListeners();
    try {
      this.configurePolling();
    } catch (error) {
      this.error('[device.ts] onInit -> configurePolling failed: %s', (error as Error).message);
      throw error;
    }

    this.homey.settings.on('set', (key) => {
      if (key === 'pollEssential' || key === 'pollEnvironment' || key === 'pollExtended') {
        try {
          this.configurePolling();
        } catch (error) {
          this.error('[device.ts] settings listener -> configurePolling failed: %s', (error as Error).message);
        }
      }
    });

    await this.pollOnce('essential');
    this.log('Device initialized');
  }

  async onAdded(): Promise<void> {
    this.log('Device added');
  }

  async onDeleted(): Promise<void> {
    this.pollScheduler?.stop();
    this.log('Device removed');
  }

  async handleDriverRescan(): Promise<void> {
    try {
      await this.ensureCapabilities();
    } catch (error) {
      this.error('[device.ts] handleDriverRescan -> ensureCapabilities failed: %s', (error as Error).message);
      throw error;
    }
    await this.pollOnce('extended');
  }

  private registerCapabilityListeners(): void {
    this.registerCapabilityListener('onoff', async (value) => {
      await this.setPower(Boolean(value));
    });

    this.registerCapabilityListener('thermostat_mode', async (value) => {
      await this.setThermostatMode(value as ThermostatMode);
    });

    this.registerCapabilityListener('target_temperature', async (value) => {
      await this.setTargetTemperature(Number(value));
    });

    if (this.hasCapability('fan_speed')) {
      this.registerCapabilityListener('fan_speed', async (value) => {
        await this.setFanSpeed(value as FanSpeed);
      });
    }

    if (this.hasCapability('swing_mode')) {
      this.registerCapabilityListener('swing_mode', async (value) => {
        await this.setSwingMode(value as SwingMode);
      });
    }
  }

  private async ensureCapabilities(): Promise<void> {
    const plan = buildCapabilityPlan({
      id: String(this.getData().id),
      name: this.getName(),
      features: this.features,
    });

    const current = this.getCapabilities();
    for (const capability of plan.capabilities) {
      if (!current.includes(capability)) {
        try {
          await this.addCapability(capability);
        } catch (error) {
          this.error(
            '[device.ts] ensureCapabilities -> addCapability("%s") failed: %s',
            capability,
            (error as Error).message,
          );
          throw error;
        }
      }
    }

    for (const capability of current) {
      if (!plan.capabilities.includes(capability)) {
        try {
          await this.removeCapability(capability);
        } catch (error) {
          this.error(
            '[device.ts] ensureCapabilities -> removeCapability("%s") failed: %s',
            capability,
            (error as Error).message,
          );
          throw error;
        }
      }
    }

    if (this.hasCapability('target_temperature')) {
      try {
        await this.setCapabilityOptions('target_temperature', {
          min: this.features.minTemperature ?? 16,
          max: this.features.maxTemperature ?? 30,
          step: 0.5,
        });
      } catch (error) {
        this.error('[device.ts] ensureCapabilities -> setCapabilityOptions failed: %s', (error as Error).message);
        throw error;
      }
    }
  }

  private configurePolling(): void {
    try {
      const app = this.homey.app as PanasonicComfortCloudApp;
      const intervals = app.getPollIntervals();

      this.pollScheduler?.stop();
      this.pollScheduler = new PollScheduler({
        logger: (message, ...args) => this.log(message, ...args),
        jitter: 2000,
      });

      const scheduler = this.pollScheduler;
      const registerTask = (task: { id: string; interval: number; run: () => Promise<void>; immediate: boolean }) => {
        try {
          scheduler.register(task);
        } catch (error) {
          this.error('[device.ts] configurePolling -> register "%s" failed: %s', task.id, (error as Error).message);
          throw error;
        }
      };

      registerTask({
        id: 'essential',
        interval: intervals.essential,
        run: () => this.pollOnce('essential'),
        immediate: true,
      });

      registerTask({
        id: 'environment',
        interval: intervals.environment,
        run: () => this.pollOnce('environment'),
        immediate: true,
      });

      registerTask({
        id: 'extended',
        interval: intervals.extended,
        run: () => this.pollOnce('extended'),
        immediate: true,
      });

      scheduler.start();
    } catch (error) {
      this.error('[device.ts] configurePolling failed: %s', (error as Error).message);
      throw error;
    }
  }

  private async pollOnce(scope: 'essential' | 'environment' | 'extended'): Promise<void> {
    if (this.polling) {
      return;
    }
    this.polling = true;
    try {
      const state = await this.client.readState(this.getDeviceId());
      await this.applyState(state, scope);
    } catch (error) {
      this.error(
        '[device.ts] pollOnce("%s") failed for "%s": %s',
        scope,
        this.getName(),
        (error as Error).message,
      );
    } finally {
      this.polling = false;
    }
  }

  private async applyState(state: DeviceState, scope: 'essential' | 'environment' | 'extended'): Promise<void> {
    const previous = this.lastState;
    this.lastState = state;

    const updateCapability = async (capability: string, value: unknown) => {
      if (!this.hasCapability(capability)) {
        return;
      }
      if (value === undefined || (typeof value === 'number' && Number.isNaN(value))) {
        return;
      }
      try {
        await this.setCapabilityValue(capability, value);
      } catch (error) {
        this.error(
          '[device.ts] applyState -> setCapabilityValue("%s") failed: %s',
          capability,
          (error as Error).message,
        );
      }
    };

    await updateCapability('onoff', state.on);
    await updateCapability('thermostat_mode', state.thermostatMode);
    await updateCapability('target_temperature', state.targetTemperature);

    if (scope === 'environment' || scope === 'extended') {
      await updateCapability('measure_temperature', state.indoorTemperature);
      await updateCapability('measure_humidity', state.indoorHumidity);
      if (this.hasCapability('fan_speed')) {
        await updateCapability('fan_speed', state.fanSpeed ?? 'auto');
      }
      if (this.hasCapability('swing_mode') && state.swingMode) {
        await updateCapability('swing_mode', state.swingMode);
      }
    }

    if (scope === 'extended') {
      await updateCapability('measure_temperature_outdoor', state.outdoorTemperature);
      await updateCapability('measure_power', state.powerConsumption);
      await updateCapability('meter_power', state.energyConsumption);
      await updateCapability('alarm_filter', state.filterAlarm ?? false);
      await updateCapability('alarm_connection', state.connectionAlarm ?? false);
    }

    if (state.minTemperature || state.maxTemperature) {
      try {
        await this.setCapabilityOptions('target_temperature', {
          min: state.minTemperature ?? this.features.minTemperature ?? 16,
          max: state.maxTemperature ?? this.features.maxTemperature ?? 30,
          step: 0.5,
        });
      } catch (error) {
        this.error('[device.ts] applyState -> setCapabilityOptions failed: %s', (error as Error).message);
      }
      if (state.minTemperature !== undefined) {
        this.features.minTemperature = state.minTemperature;
      }
      if (state.maxTemperature !== undefined) {
        this.features.maxTemperature = state.maxTemperature;
      }
      try {
        await this.setStoreValue('features', this.features);
      } catch (error) {
        this.error('[device.ts] applyState -> setStoreValue("features") failed: %s', (error as Error).message);
      }
    }

    this.triggerStateChanges(previous, state);
  }

  private triggerStateChanges(previous: DeviceState | undefined, current: DeviceState): void {
    if (!previous) {
      return;
    }

    const driver = this.driver as PanasonicAcDriver;

    const compare = (capability: string, newValue: unknown, oldValue: unknown) => {
      if (newValue !== oldValue) {
        driver.triggerStateChange(this, capability, newValue ?? '');
      }
    };

    compare('onoff', current.on, previous.on);
    compare('thermostat_mode', current.thermostatMode, previous.thermostatMode);
    compare('target_temperature', current.targetTemperature, previous.targetTemperature);
    compare('measure_temperature', current.indoorTemperature, previous.indoorTemperature);
    compare('measure_humidity', current.indoorHumidity, previous.indoorHumidity);
    compare('measure_temperature_outdoor', current.outdoorTemperature, previous.outdoorTemperature);
    compare('measure_power', current.powerConsumption, previous.powerConsumption);
    compare('meter_power', current.energyConsumption, previous.energyConsumption);
    compare('fan_speed', current.fanSpeed, previous.fanSpeed);
    compare('swing_mode', current.swingMode, previous.swingMode);
    compare('alarm_filter', current.filterAlarm, previous.filterAlarm);
    compare('alarm_connection', current.connectionAlarm, previous.connectionAlarm);
  }

  async setPower(state: boolean): Promise<void> {
    await this.sendPatch({ on: state });
  }

  async setThermostatMode(mode: ThermostatMode): Promise<void> {
    await this.sendPatch({ thermostatMode: mode });
  }

  async setTargetTemperature(temperature: number): Promise<void> {
    await this.sendPatch({ targetTemperature: temperature });
  }

  async setFanSpeed(speed: FanSpeed): Promise<void> {
    await this.sendPatch({ fanSpeed: speed });
  }

  async setSwingMode(mode: SwingMode): Promise<void> {
    await this.sendPatch({ swingMode: mode });
  }

  isOn(): boolean {
    return Boolean(this.getCapabilityValue('onoff'));
  }

  isMode(mode: string): boolean {
    return this.getCapabilityValue('thermostat_mode') === mode;
  }

  isIndoorTemperatureAbove(threshold: number): boolean {
    const value = Number(this.getCapabilityValue('measure_temperature'));
    return !Number.isNaN(value) && value > threshold;
  }

  isEnergyAbove(threshold: number): boolean {
    const value = Number(this.getCapabilityValue('meter_power'));
    return !Number.isNaN(value) && value > threshold;
  }

  private async sendPatch(patch: Partial<DeviceState>): Promise<void> {
    try {
      const updated = await this.client.writeState(this.getDeviceId(), patch);
      await this.applyState(updated, 'extended');
    } catch (error) {
      this.error(
        '[device.ts] sendPatch -> writeState failed for "%s": %s',
        this.getName(),
        (error as Error).message,
      );
      if (this.lastState) {
        await this.applyState(this.lastState, 'extended');
      }
      throw error;
    }
  }

  private getDeviceId(): string {
    const data = this.getData() as { id: string };
    return data.id;
  }
}

module.exports = PanasonicAcDevice;
