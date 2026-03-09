# NOAA Graphical Forecast iOS Widget

## Original Idea
I like the weather forecast graph that noaa has here:
https://forecast.weather.gov/MapClick.php?w0=t&w1=td&w2=wc&w3=sfcwind&w3u=1&w4=sky&w5=pop&w6=rh&w7=rain&w9=snow&w13u=0&w14u=1&pqpfhr=6&psnwhr=6&AheadHour=0&Submit=Submit&FcstType=graphical&textField1=39.5156&textField2=-105.3055&site=all&unit=0&dd=&bw=

What are some different ways to get that into an ios widget?
Just the graph part
it would be nice to show only 24h and be able to scroll or page over to future days

## Decisions Made
- **Platform**: Scriptable app (free iOS app, JavaScript-based widgets, no Xcode needed)
- **Data**: Match NOAA graphical forecast data — temperature, wind chill, wind speed/direction, sky cover, precip probability, relative humidity, rain amount, snow amount (dewpoint removed)
- **Location**: Aspen Park, CO (39.5156, -105.3055) — configurable in CONFIG at top of script

## Architecture
Single file: `NOAA-Forecast.js` — runs as both a home screen widget and an in-app scrollable view.

### Data Source
- NOAA Weather API (api.weather.gov), no API key needed
- Two-step fetch: `/points/{lat},{lon}` → get grid office → `/gridpoints/{office}/{x},{y}` → raw hourly data
- Grid for this location: BOU/51,52
- Data comes in ISO 8601 duration format (e.g. `PT3H`) — expanded into per-hour data points
- Units converted: °C→°F, km/h→mph, mm→inches
- Cached locally for 30 min with stale-while-error fallback

### Rendering
Stacked horizontal strip charts (like the NOAA page) drawn with Scriptable's DrawContext:
1. Temperature / Wind Chill (multi-line, left-side Y labels at 2x size + current temp in red)
2. Wind Speed (line + cardinal direction labels)
3. Sky Cover / Precip Prob / RH (combined multi-line 0-100%, sky as filled area)
4. Rain amount (bars)
5. Snow amount (bars)
- Shared time axis with hour/day labels
- Night shading, grid lines, Y-axis labels
- Dark mode support (auto-detects)

### Widget Mode
- Large widget shows current 24h window as background image
- Tapping opens Scriptable app with scrollable multi-day view
- Auto-refreshes every 30 min

### In-App Mode
- UITable with one rendered 24h graph per row
- Scroll vertically through ~7 days of forecast

## Files
- `NOAA-Forecast.js` — the Scriptable widget script (copy to iCloud Drive/Scriptable/)
- `preview.html` — browser-based Canvas preview for faster iteration on Mac (not 1:1 but close approximation)

## Preview Workflow
Since Scriptable has no macOS version, `preview.html` renders the same charts using browser Canvas API.
- Open in browser, refresh to see changes
- Theme toggle (dark/light/auto) for testing both modes
- Graphs stretch to fill browser width
- Data layer and rendering logic are duplicated between the two files

## TODO
- Test on actual iOS device in Scriptable
- Verify data matches NOAA graphical forecast page
- Fine-tune layout/sizing for large widget dimensions
- Consider medium widget variant (subset of charts)
