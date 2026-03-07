// NOAA Graphical Weather Forecast — Scriptable iOS Widget
// Replicates the NOAA graphical forecast page as a Scriptable widget.
// Shows 24h of weather data; tap to open scrollable multi-day view.

// ── Configuration ──────────────────────────────────────────────────
const CONFIG = {
  LAT: 39.5156,
  LON: -105.3055,
  CACHE_MINUTES: 30,
  HOURS_PER_PAGE: 24,
};

const DARK = Device.isUsingDarkAppearance();
const BG_COLOR = DARK ? new Color("#1C1C1E") : new Color("#FFFFFF");
const TEXT_COLOR = DARK ? new Color("#FFFFFF") : new Color("#000000");
const GRID_COLOR = DARK ? new Color("#444444", 0.5) : new Color("#CCCCCC", 0.6);
const LABEL_COLOR = DARK ? new Color("#BBBBBB") : new Color("#555555");
const NIGHT_OVERLAY = new Color(DARK ? "#000000" : "#000033", 0.08);

const SERIES = [
  { key: "temperature",    label: "Temp °F",    color: new Color("#FF4444"), type: "line", group: "temp" },
  { key: "dewpoint",       label: "Dewpt °F",   color: new Color("#00AA00"), type: "line", group: "temp" },
  { key: "windChill",      label: "WndChl °F",  color: new Color("#6666FF"), type: "line", group: "temp" },
  { key: "windSpeed",      label: "Wind mph",   color: new Color("#996633"), type: "bar",  group: "wind" },
  { key: "skyCover",       label: "Sky %",       color: new Color("#888888"), type: "area", group: "sky",    yMin: 0, yMax: 100 },
  { key: "precipProb",     label: "PoP %",       color: new Color("#0088FF"), type: "bar",  group: "precip", yMin: 0, yMax: 100 },
  { key: "humidity",       label: "RH %",        color: new Color("#00CCCC"), type: "line", group: "rh",     yMin: 0, yMax: 100 },
  { key: "rain",           label: "Rain in",     color: new Color("#0044AA"), type: "bar",  group: "rain" },
  { key: "snow",           label: "Snow in",     color: new Color("#AADDFF"), type: "bar",  group: "snow" },
];

// ── Unit Conversions ───────────────────────────────────────────────
function cToF(c) { return c != null ? c * 9 / 5 + 32 : null; }
function kphToMph(k) { return k != null ? k * 0.621371 : null; }
function mmToIn(mm) { return mm != null ? mm / 25.4 : null; }
function degToCardinal(d) {
  if (d == null) return "";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(d / 22.5) % 16];
}

// ── ISO 8601 Duration Parsing ──────────────────────────────────────
function parseDurationHours(dur) {
  let hours = 0;
  const dayMatch = dur.match(/(\d+)D/);
  const hourMatch = dur.match(/(\d+)H/);
  if (dayMatch) hours += parseInt(dayMatch[1]) * 24;
  if (hourMatch) hours += parseInt(hourMatch[1]);
  return Math.max(hours, 1);
}

function expandTimeSeries(property) {
  if (!property || !property.values) return [];
  const result = [];
  for (const v of property.values) {
    const [dateStr, durStr] = v.validTime.split("/");
    const start = new Date(dateStr);
    const durationH = parseDurationHours(durStr);
    for (let h = 0; h < durationH; h++) {
      const t = new Date(start.getTime() + h * 3600000);
      result.push({ time: t, value: v.value });
    }
  }
  return result;
}

// ── Data Fetching & Caching ────────────────────────────────────────
const FM = FileManager.local();
const CACHE_PATH = FM.joinPath(FM.cacheDirectory(), "noaa-forecast-cache.json");

function getCachedData() {
  if (FM.fileExists(CACHE_PATH)) {
    const raw = FM.readString(CACHE_PATH);
    const cached = JSON.parse(raw);
    return cached;
  }
  return null;
}

function setCachedData(data) {
  FM.writeString(CACHE_PATH, JSON.stringify({ timestamp: Date.now(), data }));
}

function isCacheValid(cached) {
  if (!cached) return false;
  return (Date.now() - cached.timestamp) < CONFIG.CACHE_MINUTES * 60000;
}

async function fetchForecastData() {
  const cached = getCachedData();
  if (isCacheValid(cached)) return cached.data;

  try {
    const ptReq = new Request(`https://api.weather.gov/points/${CONFIG.LAT},${CONFIG.LON}`);
    ptReq.headers = { "User-Agent": "(NOAA-Forecast-Widget, scriptable@example.com)", "Accept": "application/geo+json" };
    const ptData = await ptReq.loadJSON();
    const { gridId, gridX, gridY } = ptData.properties;
    const city = ptData.properties.relativeLocation.properties.city;
    const state = ptData.properties.relativeLocation.properties.state;

    const gridReq = new Request(`https://api.weather.gov/gridpoints/${gridId}/${gridX},${gridY}`);
    gridReq.headers = ptReq.headers;
    const gridData = await gridReq.loadJSON();
    const p = gridData.properties;

    const dataset = buildDataset(p, `${city}, ${state}`);
    setCachedData(dataset);
    return dataset;
  } catch (e) {
    if (cached) return cached.data;
    throw e;
  }
}

function buildDataset(p, locationName) {
  const raw = {
    temperature:  expandTimeSeries(p.temperature),
    dewpoint:     expandTimeSeries(p.dewpoint),
    windChill:    expandTimeSeries(p.windChill),
    windSpeed:    expandTimeSeries(p.windSpeed),
    windDir:      expandTimeSeries(p.windDirection),
    skyCover:     expandTimeSeries(p.skyCover),
    precipProb:   expandTimeSeries(p.probabilityOfPrecipitation),
    humidity:     expandTimeSeries(p.relativeHumidity),
    rain:         expandTimeSeries(p.quantitativePrecipitation),
    snow:         expandTimeSeries(p.snowfallAmount),
  };

  // Find the common time range
  let minTime = Infinity, maxTime = -Infinity;
  for (const key of Object.keys(raw)) {
    for (const pt of raw[key]) {
      const t = pt.time.getTime();
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    }
  }

  // Build hourly array
  const hours = [];
  for (let t = minTime; t <= maxTime; t += 3600000) {
    hours.push(new Date(t));
  }

  // Map each series to the hourly array
  function mapSeries(arr, convert) {
    const lookup = new Map();
    for (const pt of arr) lookup.set(pt.time.getTime(), pt.value);
    return hours.map(h => {
      const v = lookup.get(h.getTime());
      return convert ? convert(v != null ? v : null) : (v != null ? v : null);
    });
  }

  return {
    locationName,
    hours: hours.map(h => h.toISOString()),
    temperature: mapSeries(raw.temperature, cToF),
    dewpoint:    mapSeries(raw.dewpoint, cToF),
    windChill:   mapSeries(raw.windChill, cToF),
    windSpeed:   mapSeries(raw.windSpeed, kphToMph),
    windDir:     mapSeries(raw.windDir),
    skyCover:    mapSeries(raw.skyCover),
    precipProb:  mapSeries(raw.precipProb),
    humidity:    mapSeries(raw.humidity),
    rain:        mapSeries(raw.rain, mmToIn),
    snow:        mapSeries(raw.snow, mmToIn),
  };
}

// ── Drawing Helpers ────────────────────────────────────────────────
function drawHorizontalGrid(ctx, rect, yMin, yMax, steps) {
  ctx.setStrokeColor(GRID_COLOR);
  ctx.setLineWidth(0.5);
  for (let i = 0; i <= steps; i++) {
    const y = rect.y + (i / steps) * rect.height;
    const path = new Path();
    path.move(new Point(rect.x, y));
    path.addLine(new Point(rect.x + rect.width, y));
    ctx.addPath(path);
    ctx.strokePath();
  }
}

function drawStripLabel(ctx, label, rect) {
  ctx.setFont(Font.boldSystemFont(8));
  ctx.setTextColor(LABEL_COLOR);
  ctx.drawTextInRect(label, new Rect(rect.x + 2, rect.y, 60, 12));
}

function drawYLabels(ctx, yMin, yMax, rect) {
  ctx.setFont(Font.systemFont(7));
  ctx.setTextColor(LABEL_COLOR);
  const maxStr = yMax % 1 === 0 ? String(Math.round(yMax)) : yMax.toFixed(1);
  const minStr = yMin % 1 === 0 ? String(Math.round(yMin)) : yMin.toFixed(1);
  ctx.drawTextInRect(maxStr, new Rect(rect.x + rect.width - 28, rect.y, 26, 10));
  ctx.drawTextInRect(minStr, new Rect(rect.x + rect.width - 28, rect.y + rect.height - 10, 26, 10));
}

function drawLineChart(ctx, data, yMin, yMax, rect, color, lineWidth) {
  if (data.every(v => v == null)) return;
  ctx.setStrokeColor(color);
  ctx.setLineWidth(lineWidth || 1.5);
  const path = new Path();
  let started = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i] == null) { started = false; continue; }
    const x = rect.x + (i / (data.length - 1)) * rect.width;
    const yFrac = (data[i] - yMin) / (yMax - yMin);
    const y = rect.y + rect.height - yFrac * rect.height;
    if (!started) { path.move(new Point(x, y)); started = true; }
    else path.addLine(new Point(x, y));
  }
  ctx.addPath(path);
  ctx.strokePath();
}

function drawBarChart(ctx, data, yMin, yMax, rect, color) {
  const barW = rect.width / data.length;
  ctx.setFillColor(color);
  for (let i = 0; i < data.length; i++) {
    if (data[i] == null || data[i] <= 0) continue;
    const yFrac = Math.min((data[i] - yMin) / (yMax - yMin), 1);
    const barH = yFrac * rect.height;
    const x = rect.x + i * barW;
    const y = rect.y + rect.height - barH;
    ctx.fillRect(new Rect(x, y, Math.max(barW - 1, 1), barH));
  }
}

function drawFilledArea(ctx, data, yMin, yMax, rect, color) {
  if (data.every(v => v == null)) return;
  const fillColor = new Color(color.hex, 0.3);
  ctx.setFillColor(fillColor);
  const path = new Path();
  path.move(new Point(rect.x, rect.y + rect.height));
  for (let i = 0; i < data.length; i++) {
    const val = data[i] != null ? data[i] : 0;
    const x = rect.x + (i / (data.length - 1)) * rect.width;
    const yFrac = (val - yMin) / (yMax - yMin);
    const y = rect.y + rect.height - yFrac * rect.height;
    path.addLine(new Point(x, y));
  }
  path.addLine(new Point(rect.x + rect.width, rect.y + rect.height));
  path.closeSubpath();
  ctx.addPath(path);
  ctx.fillPath();
  // Draw the line on top
  drawLineChart(ctx, data, yMin, yMax, rect, color, 1);
}

function drawNightShading(ctx, hours, rect) {
  const barW = rect.width / hours.length;
  ctx.setFillColor(NIGHT_OVERLAY);
  for (let i = 0; i < hours.length; i++) {
    const d = new Date(hours[i]);
    const h = d.getHours();
    if (h < 6 || h >= 20) {
      ctx.fillRect(new Rect(rect.x + i * barW, rect.y, barW, rect.height));
    }
  }
}

function drawTimeAxis(ctx, hours, rect) {
  ctx.setFont(Font.systemFont(8));
  ctx.setTextColor(LABEL_COLOR);
  const barW = rect.width / hours.length;
  let lastDay = -1;
  for (let i = 0; i < hours.length; i++) {
    const d = new Date(hours[i]);
    const h = d.getHours();
    // Hour labels every 3 hours
    if (h % 3 === 0) {
      const label = h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`;
      const x = rect.x + i * barW;
      ctx.drawTextInRect(label, new Rect(x - 8, rect.y, 20, 12));

      // Vertical grid line
      ctx.setStrokeColor(h === 0 || h === 12 ? new Color(LABEL_COLOR.hex, 0.4) : GRID_COLOR);
      ctx.setLineWidth(h === 0 ? 1 : 0.5);
      const gridPath = new Path();
      gridPath.move(new Point(x, 0));
      gridPath.addLine(new Point(x, rect.y));
      ctx.addPath(gridPath);
      ctx.strokePath();
    }
    // Day label at midnight
    if (d.getDate() !== lastDay) {
      lastDay = d.getDate();
      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const dayLabel = `${dayNames[d.getDay()]} ${monthNames[d.getMonth()]} ${d.getDate()}`;
      const x = rect.x + i * barW;
      ctx.setFont(Font.boldSystemFont(8));
      ctx.setTextColor(TEXT_COLOR);
      ctx.drawTextInRect(dayLabel, new Rect(x + 2, rect.y + 12, 80, 12));
      ctx.setFont(Font.systemFont(8));
      ctx.setTextColor(LABEL_COLOR);
    }
  }
}

function drawWindDirectionLabels(ctx, windDir, hours, rect) {
  ctx.setFont(Font.systemFont(6));
  ctx.setTextColor(LABEL_COLOR);
  const barW = rect.width / hours.length;
  for (let i = 0; i < hours.length; i++) {
    const d = new Date(hours[i]);
    if (d.getHours() % 3 === 0 && windDir[i] != null) {
      const cardinal = degToCardinal(windDir[i]);
      const x = rect.x + i * barW;
      ctx.drawTextInRect(cardinal, new Rect(x - 6, rect.y + rect.height - 9, 16, 9));
    }
  }
}

// ── Main Graph Renderer ───────────────────────────────────────────
function autoRange(data, padding) {
  const valid = data.filter(v => v != null);
  if (valid.length === 0) return { min: 0, max: 1 };
  let min = Math.min(...valid);
  let max = Math.max(...valid);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * (padding || 0.1);
  return { min: Math.floor(min - pad), max: Math.ceil(max + pad) };
}

function renderForecastGraph(dataset, startIdx, count) {
  const W = 720;
  const H = 680;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = true;
  ctx.respectScreenScale = false;
  ctx.setFillColor(BG_COLOR);
  ctx.fillRect(new Rect(0, 0, W, H));

  const hours = dataset.hours.slice(startIdx, startIdx + count);
  const sliceData = (key) => dataset[key].slice(startIdx, startIdx + count);

  const MARGIN_L = 4;
  const MARGIN_R = 4;
  const PLOT_W = W - MARGIN_L - MARGIN_R;

  // Header
  const startDate = new Date(hours[0]);
  const endDate = new Date(hours[hours.length - 1]);
  const fmt = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  ctx.setFont(Font.boldSystemFont(13));
  ctx.setTextColor(TEXT_COLOR);
  ctx.drawTextInRect(
    `${dataset.locationName} — ${fmt(startDate)} to ${fmt(endDate)}`,
    new Rect(MARGIN_L + 2, 4, PLOT_W, 18)
  );

  // Strip definitions: { key(s), label, type, height }
  const strips = [
    {
      label: "Temperature / Dewpoint / Wind Chill (°F)", height: 100, type: "multi-line",
      series: [
        { data: sliceData("temperature"), color: SERIES[0].color, width: 2 },
        { data: sliceData("dewpoint"),    color: SERIES[1].color, width: 1.5 },
        { data: sliceData("windChill"),   color: SERIES[2].color, width: 1 },
      ],
    },
    {
      label: "Wind Speed (mph)", height: 70, type: "bar",
      data: sliceData("windSpeed"), color: SERIES[3].color,
      windDir: sliceData("windDir"),
    },
    {
      label: "Sky Cover (%)", height: 60, type: "area",
      data: sliceData("skyCover"), color: SERIES[4].color,
      yMin: 0, yMax: 100,
    },
    {
      label: "Precip Probability (%)", height: 60, type: "bar",
      data: sliceData("precipProb"), color: SERIES[5].color,
      yMin: 0, yMax: 100,
    },
    {
      label: "Relative Humidity (%)", height: 55, type: "line",
      data: sliceData("humidity"), color: SERIES[6].color,
      yMin: 0, yMax: 100,
    },
    {
      label: "Rain (in)", height: 50, type: "bar",
      data: sliceData("rain"), color: SERIES[7].color,
    },
    {
      label: "Snow (in)", height: 50, type: "bar",
      data: sliceData("snow"), color: SERIES[8].color,
    },
  ];

  let y = 26;
  const GAP = 6;

  for (const strip of strips) {
    const rect = new Rect(MARGIN_L, y, PLOT_W, strip.height);

    // Night shading
    drawNightShading(ctx, hours, rect);

    // Separator line at top
    ctx.setStrokeColor(GRID_COLOR);
    ctx.setLineWidth(0.5);
    const sep = new Path();
    sep.move(new Point(rect.x, rect.y));
    sep.addLine(new Point(rect.x + rect.width, rect.y));
    ctx.addPath(sep);
    ctx.strokePath();

    // Label
    drawStripLabel(ctx, strip.label, rect);
    const plotRect = new Rect(rect.x, rect.y + 12, rect.width, rect.height - 12);

    if (strip.type === "multi-line") {
      // Auto-range across all series
      const allVals = strip.series.flatMap(s => s.data).filter(v => v != null);
      const range = autoRange(allVals, 0.1);
      drawHorizontalGrid(ctx, plotRect, range.min, range.max, 4);
      drawYLabels(ctx, range.min, range.max, plotRect);
      for (const s of strip.series) {
        drawLineChart(ctx, s.data, range.min, range.max, plotRect, s.color, s.width);
      }
      // Legend
      let lx = rect.x + 2;
      const ly = rect.y + rect.height - 10;
      ctx.setFont(Font.systemFont(7));
      const labels = [
        { text: "Temp", color: SERIES[0].color },
        { text: "Dewpt", color: SERIES[1].color },
        { text: "WndChl", color: SERIES[2].color },
      ];
      for (const l of labels) {
        ctx.setFillColor(l.color);
        ctx.fillRect(new Rect(lx, ly + 3, 8, 2));
        lx += 10;
        ctx.setTextColor(l.color);
        ctx.drawTextInRect(l.text, new Rect(lx, ly, 30, 10));
        lx += 32;
      }
    } else if (strip.type === "bar") {
      const yMin = strip.yMin != null ? strip.yMin : 0;
      const yMax = strip.yMax != null ? strip.yMax : (autoRange(strip.data, 0.1).max || 1);
      drawHorizontalGrid(ctx, plotRect, yMin, yMax, 4);
      drawYLabels(ctx, yMin, yMax, plotRect);
      drawBarChart(ctx, strip.data, yMin, yMax, plotRect, strip.color);
      if (strip.windDir) {
        drawWindDirectionLabels(ctx, strip.windDir, hours, plotRect);
      }
    } else if (strip.type === "area") {
      const yMin = strip.yMin != null ? strip.yMin : 0;
      const yMax = strip.yMax != null ? strip.yMax : 100;
      drawHorizontalGrid(ctx, plotRect, yMin, yMax, 4);
      drawYLabels(ctx, yMin, yMax, plotRect);
      drawFilledArea(ctx, strip.data, yMin, yMax, plotRect, strip.color);
    } else if (strip.type === "line") {
      const yMin = strip.yMin != null ? strip.yMin : autoRange(strip.data, 0.1).min;
      const yMax = strip.yMax != null ? strip.yMax : autoRange(strip.data, 0.1).max;
      drawHorizontalGrid(ctx, plotRect, yMin, yMax, 4);
      drawYLabels(ctx, yMin, yMax, plotRect);
      drawLineChart(ctx, strip.data, yMin, yMax, plotRect, strip.color, 1.5);
    }

    y += strip.height + GAP;
  }

  // Time axis
  const axisRect = new Rect(MARGIN_L, y, PLOT_W, 28);
  drawTimeAxis(ctx, hours, axisRect);

  return ctx.getImage();
}

// ── Widget Mode ───────────────────────────────────────────────────
async function createWidget() {
  const dataset = await fetchForecastData();

  // Find the index closest to "now"
  const now = Date.now();
  let startIdx = 0;
  for (let i = 0; i < dataset.hours.length; i++) {
    if (new Date(dataset.hours[i]).getTime() <= now) startIdx = i;
    else break;
  }
  // Back up a couple hours so current hour is visible
  startIdx = Math.max(0, startIdx - 2);
  const count = Math.min(CONFIG.HOURS_PER_PAGE, dataset.hours.length - startIdx);

  const img = renderForecastGraph(dataset, startIdx, count);

  const widget = new ListWidget();
  widget.backgroundImage = img;
  widget.setPadding(0, 0, 0, 0);
  widget.url = URLScheme.forRunningScript();
  widget.refreshAfterDate = new Date(Date.now() + CONFIG.CACHE_MINUTES * 60000);

  return widget;
}

// ── In-App View ───────────────────────────────────────────────────
async function presentFullView() {
  const dataset = await fetchForecastData();
  const totalHours = dataset.hours.length;
  const pageSize = CONFIG.HOURS_PER_PAGE;

  const table = new UITable();
  table.showSeparators = false;

  // Find start: nearest hour aligned to local midnight or current time
  const now = Date.now();
  let firstIdx = 0;
  for (let i = 0; i < totalHours; i++) {
    if (new Date(dataset.hours[i]).getTime() <= now) firstIdx = i;
    else break;
  }
  firstIdx = Math.max(0, firstIdx - 2);

  for (let start = firstIdx; start < totalHours; start += pageSize) {
    const count = Math.min(pageSize, totalHours - start);
    if (count < 6) break; // Skip tiny leftover pages

    const img = renderForecastGraph(dataset, start, count);
    const row = new UITableRow();
    row.height = 360;
    const cell = row.addImage(img);
    cell.widthWeight = 100;
    table.addRow(row);

    // Spacer row
    const spacer = new UITableRow();
    spacer.height = 8;
    spacer.backgroundColor = BG_COLOR;
    table.addRow(spacer);
  }

  await table.present(true);
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  if (config.runsInWidget) {
    const widget = await createWidget();
    Script.setWidget(widget);
  } else {
    await presentFullView();
  }
  Script.complete();
}

await main();
