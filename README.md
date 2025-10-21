# Panasonic Comfort Cloud for Homey

Unofficial Homey SDK v3 integration for Panasonic Comfort Cloud. Discover, control and monitor your Panasonic air conditioners and heat pumps directly from Homey without relying on the Comfort Cloud mobile app.

## Features

- Secure email/password login with automatic token refresh.
- Automatic discovery of all Comfort Cloud controlled indoor units.
- Core climate controls: power, thermostat mode, setpoint, fan speed and swing.
- Sensor telemetry: indoor temperature & humidity, outdoor temperature, power and energy (when available).
- Flow cards for automations (actions, conditions and triggers).
- Tiered polling with configurable intervals and adaptive back-off.
- Optional debug logging and one-click device rescan.

> **Note**
> Panasonic does not offer a public OAuth2 integration for Comfort Cloud. This app uses the same HTTPS endpoints as the mobile application. Credentials are stored encrypted using Homey Storage and never logged.

## Requirements

- Homey Pro (Early 2023 or later) running firmware 12.4.0 or newer.
- Active Panasonic Comfort Cloud account with at least one connected indoor unit.

## Installation

1. Clone this repository and install dependencies:
   ```bash
   npm install
   npm run build
   ```
2. Use the Homey CLI to install the app on your Homey Pro:
   ```bash
   homey app install
   ```
3. (Optional) enable debug logging from the app settings page to help diagnose issues.

## Pairing & Usage

1. In the Homey mobile app, go to **Devices → + → Panasonic Comfort Cloud**.
2. Enter the same email address and password you use in the Comfort Cloud app.
3. After authentication the app lists all available Comfort Cloud devices. Select the units you want to add and finish the wizard.
4. Each device tile shows real-time power state, mode and temperature. Tap a tile to access additional controls and telemetry.

### Supported capabilities

| Capability | Description |
|------------|-------------|
| `onoff` | Turn the indoor unit on or off |
| `thermostat_mode` | Auto, cool, heat, dry or fan mode |
| `target_temperature` | Desired room temperature |
| `measure_temperature` | Current indoor temperature |
| `measure_humidity` | Indoor humidity (if available) |
| `measure_temperature.outdoor` | Outdoor temperature reported by the unit |
| `fan_speed` | Auto/low/medium/high fan speed |
| `swing_mode` | Louver swing: off, vertical, horizontal or both |
| `measure_power` & `meter_power` | Instantaneous and cumulative energy, when supported |
| `alarm_filter`, `alarm_connection` | Optional health indicators |

### Flow cards

- **Actions:** Set power, thermostat mode, temperature, fan speed or swing position.
- **Conditions:** Check if a unit is on, running a specific mode, indoor temperature above a threshold or energy consumption above a threshold.
- **Triggers:** Trigger flows whenever any tracked capability changes.

## Polling & performance

The driver uses a three-tier polling strategy:

| Tier | Interval (default) | Data |
|------|--------------------|------|
| Essential | 75 s | Power, mode, target temperature |
| Environment | 120 s | Indoor temperature & humidity, fan and swing |
| Extended | 15 min | Outdoor temperature, power, energy & alarms |

You can adjust the polling intervals from the app settings page. The HTTP client automatically applies exponential backoff when Comfort Cloud returns throttling or server errors.

## Privacy & security

- Credentials are stored in Homey’s encrypted storage and never logged in plain text.
- Access and refresh tokens are rotated automatically and kept inside Homey only.
- No telemetry is shared with third parties. All traffic goes directly to `accsmart.panasonic.com` over HTTPS.
- Use the **Rescan devices** button in settings if you change your Comfort Cloud password or add new units.

## Troubleshooting

- Verify the email/password combination works in the official Comfort Cloud app.
- Enable debug logging in the app settings and check the Homey Developer Tools log console.
- Use the **Rescan devices** button or remove/re-add the device if new capabilities appear in Panasonic’s app.
- For rate limiting issues the driver automatically backs off and retries; repeated failures will be logged.

## Contributing

Issues and pull requests are welcome. Please ensure linting, unit tests (`npm test`) and TypeScript build (`npm run build`) pass before submitting.

## License

MIT © Kristoffer Nerskogen Helle
