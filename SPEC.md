# NOAA Graphical Forecast Widget — Specification

## Overview

A single-file Scriptable iOS widget (`NOAA-Forecast.js`) that replicates the NOAA graphical weather forecast as stacked horizontal strip charts. A companion browser preview (`preview.html`) mirrors the same layout using Canvas API for faster development iteration.

## Data Source

### NOAA Weather API

- **Base URL**: `https://api.weather.gov`
- **Auth**: None required, but `User-Agent: NOAAForecastWidget/1.0` header is mandatory
- **Accept header**: `application/geo+json`

### Two-Step Fetch

1. `GET /points/{lat},{lon}` — returns grid office, gridX, gridY, and location metadata
2. `GET /gridpoints/{gridId}/{gridX},{gridY}` — returns raw hourly forecast properties

### Forecast Properties Used

| API Property | Internal Key | Unit Conversion | Description |
|---|---|---|---|
| `temperature` | `temperature` | °C → °F | Air temperature |
| `windChill` | `windChill` | °C → °F | Wind chill (null when warm) |
| `windSpeed` | `windSpeed` | km/h → mph | Sustained wind speed |
| `windDirection` | `windDir` | degrees → cardinal (16-point) | Wind direction |
| `skyCover` | `skyCover` | none (%) | Cloud cover percentage |
| `probabilityOfPrecipitation` | `precipProb` | none (%) | Chance of precipitation |
| `relativeHumidity` | `humidity` | none (%) | Relative humidity |
| `quantitativePrecipitation` | `rain` | mm → inches | Liquid precipitation amount |
| `snowfallAmount` | `snow` | mm → inches | Snowfall amount |

### Time Series Format

Each property value has `validTime` in ISO 8601 format: `"2026-03-07T04:00:00+00:00/PT3H"` (datetime/duration). Durations are expanded into individual hourly data points, each inheriting the parent value.

Supported duration tokens: `D` (days × 24h), `H` (hours). Minimum 1 hour.

### Caching

- Cache file: `noaa-forecast-cache.json` in Scriptable's local cache directory
- TTL: 30 minutes (configurable via `CONFIG.CACHE_MINUTES`)
- Stale-while-error: if API fetch fails and cache exists, return stale data regardless of age
- Cache stores: `{ timestamp, data }` where `data` is the fully processed dataset

### Error Handling

- HTTP errors: caught via response status check
- JSON parse errors: caught explicitly (NOAA sometimes returns HTML error pages)
- API failure with cache: silently returns stale cached data
- API failure without cache: throws error; widget shows error state
- Preview shows friendly message: "NOAA is broken, try again later"

## Configuration

```javascript
const CONFIG = {
  LAT: 39.5156,        // Latitude (default: Aspen Park, CO)
  LON: -105.3055,      // Longitude
  CACHE_MINUTES: 30,   // Cache TTL
  HOURS_PER_PAGE: 24,  // Hours per chart page
};
```

## Visual Design

### Theme

Dark mode only. No light mode support.

| Token | Value |
|---|---|
| Background | `#1C1C1E` |
| Text | `#FFFFFF` |
| Grid lines | `rgba(68,68,68,0.5)` |
| Labels | `#BBBBBB` |
| Night overlay | `rgba(0,0,0,0.2)` |

### Series Colors

| Series | Color |
|---|---|
| Temperature | `#FF4444` (red) |
| Wind Chill | `#6666FF` (blue) |
| Wind Speed | `#BBBBBB` (gray) |
| Sky Cover | `#CCCCCC` (light gray) |
| Precip Probability | `#0088FF` (blue) |
| Relative Humidity | `#00CCCC` (teal) |
| Rain | `#66BB66` (green) |
| Snow | `#88BBFF` (light blue) |

### Canvas Dimensions

- Widget render size: 720 × 370 pixels
- Margins: 4px left, 4px right
- Plot width: 712px

## Strip Chart Layout

Each 24h page renders as a vertical stack of strip charts sharing a common time axis.

### Layout (top to bottom)

| Element | Height | Description |
|---|---|---|
| Header | 22px | Location name + time offset ("Foxtown now", "Foxtown +24h") |
| Strip 1: Temp/Wind | 100px | Multi-line: temperature, wind chill, wind speed overlay |
| Separator | 4px | Dark band `rgba(0,0,0,0.5)` centered in 8px gap |
| Strip 2: Sky/Precip/RH | 80px | Multi-line: sky cover (filled), precip probability, humidity |
| Separator | 4px | |
| Strip 3: Rain | 50px | Bar chart with per-bar value labels |
| Separator | 4px | |
| Strip 4: Snow | 50px | Bar chart with per-bar value labels |
| Gap | 8px | |
| Time axis | 28px | Hour labels every 3h, day labels at midnight |

**Total**: ~370px

### Gap Between Strips

- 8px vertical gap between each strip
- 4px dark separator band (`rgba(0,0,0,0.5)`) centered in the gap

### Strip 1: Temperature / Wind Chill / Wind Speed

- **Type**: Multi-line with filled area overlay
- **Wind speed**: Drawn first as filled area (opacity 0.12), fixed Y range 0–100 mph
- **Temperature**: Line (width 2), auto-ranged with 10% padding
- **Wind chill**: Line (width 1), shares temperature Y range
- **Y-axis labels**: Left side, 14px font, showing data min/max
- **Current temperature**: Displayed in red bold at the corresponding Y position
- **Legend** (top-right): "Temperature (°F)", "Wind Chill (°F)"
- **Wind direction**: Cardinal labels (N, NE, etc.) at bottom of plot, every 3 hours

### Strip 2: Sky Cover / Precip Probability / Humidity

- **Type**: Multi-line with filled area
- **Fixed Y range**: 0–100%
- **Sky cover**: Filled area (width 1.5)
- **Precip probability**: Line (width 2)
- **Humidity**: Line (width 1.5)
- **Legend** (top-right): "Sky Cover", "Precipitation Probability", "Relative Humidity"

### Strip 3: Rain Amount

- **Type**: Bar chart
- **Y range**: Auto-scaled from data
- **Bar value labels**: 6px font above each bar showing inches (2 decimal places if < 0.1")
- **Legend** (top-right): "Rain X.X inches" showing 24h accumulation total

### Strip 4: Snow Amount

- **Type**: Bar chart
- Same rendering as rain
- **Legend** (top-right): "Snow X.X inches" showing 24h accumulation total

### Accumulation Totals

The `accumTotal()` function sums all positive values in a 24h slice:
- Values < 0.1 but > 0: displayed with 2 decimal places
- All other values: 1 decimal place

### Night Shading

Hours 0–5 and 20–23 (local time) are overlaid with `rgba(0,0,0,0.2)` across the full strip height.

### Time Axis

- Hour labels every 3 hours: "12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"
- Vertical grid lines at each labeled hour, full height of all strips
- Midnight/noon lines: stronger opacity (0.4), midnight has 1px width
- Day labels at midnight transitions: bold, format "Wed Mar 11"

### Horizontal Grid

- 4 horizontal grid lines per strip
- 0.5px width, grid color

### Y-Axis Labels

- **Temperature strip**: Left side, 14px, shows data min and max at their actual Y positions, plus current temp in red
- **Percentage strips**: Right side, 7px, shows range min/max at top/bottom

### Legends

- 11px system font, right-aligned at top of each strip
- Each entry: colored line swatch (10×2px) + colored text
- Laid out right-to-left with 6px spacing between entries
- Text width estimated at 6.5px per character (Scriptable has no `measureText`)

## Widget Mode

- Renders on `config.runsInWidget === true`
- Finds the current hour in the dataset, backs up 2 hours for context
- Renders one 24h page as a background image on a `ListWidget`
- Zero padding on all sides
- `widget.url` opens the Scriptable script on tap
- `refreshAfterDate` set to cache TTL (30 min)

## In-App Mode

- Renders when not running as widget (tap to open or run from Scriptable app)
- Creates a `UITable` with `showSeparators = false`
- Starting from current time (minus 2h), generates one row per 24h page
- Each row: 360px height, contains rendered graph image at 100% width weight
- 8px spacer rows between pages (background matches app theme)
- Pages with fewer than 6 hours of data are skipped
- Table presented fullscreen

## Preview (preview.html)

Browser-based development preview using Canvas API.

### Differences from Scriptable Version

| Aspect | Scriptable | Preview |
|---|---|---|
| Drawing API | `DrawContext`, `Path`, `Point`, `Rect` | Canvas 2D context |
| Text measurement | Estimated (6.5px/char) | `ctx.measureText()` |
| Caching | `FileManager.local()` | None |
| Widget mode | `ListWidget` background image | N/A |
| In-app mode | `UITable` rows | Stacked `<canvas>` elements |
| Canvas width | Fixed 720px | Responsive (browser width) |

### Controls

- **Reload Data**: Fetches live data from NOAA API
- **Simulated Data**: Generates 7 days (168 hours) of synthetic data

### Simulated Data

Generates a realistic weather pattern:
- Cold front arrival with temperature drop
- Wind speed increase during front passage
- Rain transitioning to snow
- Cloud cover and humidity patterns matching storm progression
- Diurnal temperature variation

### Rendering

- Each 24h page gets its own `<canvas>` element
- Canvas pixel width = container width × device pixel ratio (for sharpness)
- CSS scales canvas to 100% container width
- Same strip layout, colors, and legends as Scriptable version

## Unit Conversions

| Function | Input | Output |
|---|---|---|
| `cToF(c)` | Celsius | Fahrenheit: `c * 9/5 + 32` |
| `kphToMph(k)` | km/h | mph: `k * 0.621371` |
| `mmToIn(mm)` | millimeters | inches: `mm / 25.4` |
| `degToCardinal(d)` | degrees (0–360) | 16-point cardinal: N, NNE, NE, ... |

Null values pass through all conversions as null.

## Dataset Structure

After processing, the dataset is a flat object:

```javascript
{
  locationName: "Conifer, CO",
  hours: ["2026-03-09T00:00:00.000Z", ...],  // ISO strings
  temperature: [32, 31, ...],                  // °F
  windChill: [28, 27, ...],                    // °F (nullable)
  windSpeed: [12, 15, ...],                    // mph
  windDir: [270, 280, ...],                    // degrees (nullable)
  skyCover: [80, 75, ...],                     // %
  precipProb: [40, 50, ...],                   // %
  humidity: [65, 70, ...],                     // %
  rain: [0.01, 0.02, ...],                     // inches
  snow: [0, 0.1, ...],                         // inches
}
```

All arrays are the same length and index-aligned with `hours`.
