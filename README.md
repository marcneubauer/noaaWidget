# NOAA Graphical Forecast Widget

An iOS widget that replicates the [NOAA graphical weather forecast](https://forecast.weather.gov/MapClick.php?FcstType=graphical&textField1=39.5156&textField2=-105.3055) as stacked strip charts, built with [Scriptable](https://scriptable.app/).

![Dark theme only](https://img.shields.io/badge/theme-dark-1C1C1E)

## What It Does

Fetches hourly forecast data from the NOAA Weather API and renders it as a series of strip charts showing temperature, wind chill, wind speed, sky cover, precipitation probability, humidity, rain, and snow — just like the NOAA graphical forecast page, but on your home screen.

- **Widget**: Large widget shows current 24h forecast. Tap to open scrollable multi-day view.
- **In-App**: Scroll through ~7 days of hourly forecast data in 24h pages.

## Setup

1. Install [Scriptable](https://apps.apple.com/us/app/scriptable/id1405459188) (free)
2. Copy `NOAA-Forecast.js` to `iCloud Drive/Scriptable/`
3. Edit `CONFIG` at the top of the script with your lat/lon
4. Add a **Large** Scriptable widget to your home screen and select the script

## Files

| File | Purpose |
|------|---------|
| `NOAA-Forecast.js` | Scriptable widget script |
| `preview.html` | Browser-based Canvas preview for development |
| `SPEC.md` | Detailed specification |

## Development

Open `preview.html` in a browser to iterate on the chart layout without deploying to iOS. It includes a simulated data mode with rain/snow forecasts for testing.

## License

MIT
