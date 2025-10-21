import Homey from 'homey';
import ComfortCloudClient from '../../lib/panasonic/ComfortCloudClient';
import { buildCapabilityPlan } from '../../lib/panasonic/Mappers';
import { ProviderLoginRequest, AuthTokens, ComfortDevice } from '../../types';
import type PanasonicComfortCloudApp from '../../app';
import type { PanasonicAcDevice } from './device';

interface PairSessionState {
  client: ComfortCloudClient;
  tokens?: AuthTokens;
  devices?: ComfortDevice[];
}

export default class PanasonicAcDriver extends Homey.Driver {
  private stateChangedTrigger?: Homey.FlowCardTriggerDevice;

  async onInit(): Promise<void> {
    this.registerFlows();
    this.log('Panasonic Comfort Cloud driver initialized');
  }

  async rescanDevices(): Promise<void> {
    const devices = this.getDevices() as PanasonicAcDevice[];
    await Promise.all(
      devices.map(async (device) => {
        try {
          await device.handleDriverRescan();
        } catch (error) {
          this.error('Failed to rescan device %s: %s', device.getName(), (error as Error).message);
        }
      }),
    );
  }

  private registerFlows(): void {
    const actionPower = this.homey.flow.getActionCard('set_power');
    actionPower.registerRunListener(async ({ device, state }) => {
      return (device as PanasonicAcDevice).setPower(state);
    });

    const actionMode = this.homey.flow.getActionCard('set_mode');
    actionMode.registerRunListener(async ({ device, mode }) => {
      return (device as PanasonicAcDevice).setThermostatMode(mode);
    });

    const actionTemperature = this.homey.flow.getActionCard('set_target_temperature');
    actionTemperature.registerRunListener(async ({ device, temperature }) => {
      return (device as PanasonicAcDevice).setTargetTemperature(temperature);
    });

    const actionFanSpeed = this.homey.flow.getActionCard('set_fan_speed');
    actionFanSpeed.registerRunListener(async ({ device, speed }) => {
      return (device as PanasonicAcDevice).setFanSpeed(speed);
    });

    const actionSwing = this.homey.flow.getActionCard('set_swing_mode');
    actionSwing.registerRunListener(async ({ device, mode }) => {
      return (device as PanasonicAcDevice).setSwingMode(mode);
    });

    const conditionIsOn = this.homey.flow.getConditionCard('is_on');
    conditionIsOn.registerRunListener(async ({ device }) => {
      return (device as PanasonicAcDevice).isOn();
    });

    const conditionModeIs = this.homey.flow.getConditionCard('mode_is');
    conditionModeIs.registerRunListener(async ({ device, mode }) => {
      return (device as PanasonicAcDevice).isMode(mode);
    });

    const conditionTempAbove = this.homey.flow.getConditionCard('temperature_above');
    conditionTempAbove.registerRunListener(async ({ device, temperature }) => {
      return (device as PanasonicAcDevice).isIndoorTemperatureAbove(temperature);
    });

    const conditionEnergyAbove = this.homey.flow.getConditionCard('energy_above');
    conditionEnergyAbove.registerRunListener(async ({ device, energy }) => {
      return (device as PanasonicAcDevice).isEnergyAbove(energy);
    });

    this.stateChangedTrigger = this.homey.flow.getDeviceTriggerCard('state_changed');
  }

  triggerStateChange(device: PanasonicAcDevice, property: string, value: unknown): Promise<void> {
    if (!this.stateChangedTrigger) {
      return Promise.resolve();
    }
    return this.stateChangedTrigger.trigger(device, { property, value: String(value ?? '') });
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    const app = this.homey.app as PanasonicComfortCloudApp;
    const client = app.createClient();
    const state: PairSessionState = { client };

    const sessionAny = session as any;
    sessionAny?.on?.('disconnect', () => {
      state.devices = undefined;
      state.tokens = undefined;
    });

    session.setHandler('login', async (credentials: ProviderLoginRequest) => {
      const tokens = await client.login(credentials);
      state.tokens = tokens;
      const devices = await client.listDevices();
      state.devices = devices;
      return { success: true };
    });

    session.setHandler('list_devices', async () => {
      if (!state.tokens) {
        throw new Error('Not authenticated');
      }
      if (!state.devices) {
        state.devices = await client.listDevices();
      }

      return state.devices.map((device) => {
        const plan = buildCapabilityPlan(device);
        return {
          name: device.name,
          data: {
            id: device.id,
          },
          settings: {
            model: device.model ?? '',
          },
          store: {
            tokens: state.tokens,
            features: device.features,
          },
          capabilities: plan.capabilities,
        };
      });
    });
  }
}

module.exports = PanasonicAcDriver;
