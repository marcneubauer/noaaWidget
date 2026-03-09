// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: magic;
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

const BG_COLOR = new Color("#1C1C1E");
const TEXT_COLOR = new Color("#FFFFFF");
const GRID_COLOR = new Color("#444444", 0.5);
const LABEL_COLOR = new Color("#BBBBBB");
const NIGHT_OVERLAY = new Color("#000000", 0.2);

const SERIES = [
  { key: "temperature",    label: "Temp °F",    color: new Color("#FF4444"), type: "line", group: "temp" },
  { key: "windChill",      label: "WndChl °F",  color: new Color("#6666FF"), type: "line", group: "temp" },
  { key: "windSpeed",      label: "Wind mph",   color: new Color("#BBBBBB"), type: "area", group: "wind" },
  { key: "skyCover",       label: "Sky %",       color: new Color("#CCCCCC"), type: "area", group: "sky",    yMin: 0, yMax: 100 },
  { key: "precipProb",     label: "PoP %",       color: new Color("#0088FF"), type: "bar",  group: "precip", yMin: 0, yMax: 100 },
  { key: "humidity",       label: "RH %",        color: new Color("#00CCCC"), type: "line", group: "rh",     yMin: 0, yMax: 100 },
  { key: "rain",           label: "Rain in",     color: new Color("#66BB66"), type: "bar",  group: "rain" },
  { key: "snow",           label: "Snow in",     color: new Color("#88BBFF"), type: "bar",  group: "snow" },
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
    const hdrs = { "User-Agent": "NOAAForecastWidget/1.0", "Accept": "application/geo+json" };

    const ptReq = new Request(`https://api.weather.gov/points/${CONFIG.LAT},${CONFIG.LON}`);
    ptReq.headers = hdrs;
    const ptText = await ptReq.loadString();
    let ptData;
    try { ptData = JSON.parse(ptText); }
    catch { throw new Error(`Invalid JSON from points API: ${ptText.slice(0, 100)}`); }
    const { gridId, gridX, gridY } = ptData.properties;
    const city = ptData.properties.relativeLocation.properties.city;
    const state = ptData.properties.relativeLocation.properties.state;

    const gridReq = new Request(`https://api.weather.gov/gridpoints/${gridId}/${gridX},${gridY}`);
    gridReq.headers = hdrs;
    const gridText = await gridReq.loadString();
    let gridData;
    try { gridData = JSON.parse(gridText); }
    catch { throw new Error(`Invalid JSON from gridpoints API: ${gridText.slice(0, 100)}`); }
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
function accumTotal(data) {
  const sum = data.reduce((s, v) => s + (v != null && v > 0 ? v : 0), 0);
  return sum < 0.1 && sum > 0 ? sum.toFixed(2) : sum.toFixed(1);
}

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

function drawLegend(ctx, legends, rect) {
  ctx.setFont(Font.systemFont(11));
  let lx = rect.x + rect.width;
  const ly = rect.y;
  for (let li = legends.length - 1; li >= 0; li--) {
    const l = legends[li];
    const textW = l.text.length * 6.5;
    lx -= textW + 2;
    ctx.setTextColor(l.color);
    ctx.drawTextInRect(l.text, new Rect(lx, ly, textW + 2, 14));
    lx -= 12;
    ctx.setFillColor(l.color);
    ctx.fillRect(new Rect(lx, ly + 6, 10, 2));
    lx -= 6;
  }
}

function drawYLabels(ctx, yMin, yMax, rect, options) {
  const fontSize = (options && options.fontSize) || 7;
  const side = (options && options.side) || "right";
  ctx.setFont(Font.systemFont(fontSize));
  ctx.setTextColor(LABEL_COLOR);
  const displayMax = (options && options.dataMax != null) ? options.dataMax : yMax;
  const displayMin = (options && options.dataMin != null) ? options.dataMin : yMin;
  const maxStr = displayMax % 1 === 0 ? String(Math.round(displayMax)) : displayMax.toFixed(1);
  const minStr = displayMin % 1 === 0 ? String(Math.round(displayMin)) : displayMin.toFixed(1);
  if (side === "left") {
    // Position labels at actual data value positions
    const maxYFrac = (displayMax - yMin) / (yMax - yMin);
    const minYFrac = (displayMin - yMin) / (yMax - yMin);
    const maxY = rect.y + rect.height - maxYFrac * rect.height - fontSize / 2;
    const minY = rect.y + rect.height - minYFrac * rect.height - fontSize / 2;
    ctx.drawTextInRect(maxStr, new Rect(rect.x + 2, maxY, 40, fontSize + 4));
    ctx.drawTextInRect(minStr, new Rect(rect.x + 2, minY, 40, fontSize + 4));
    if (options && options.currentVal != null) {
      const curStr = Math.round(options.currentVal) + "°";
      const yFrac = (options.currentVal - yMin) / (yMax - yMin);
      const curY = rect.y + rect.height - yFrac * rect.height - fontSize / 2;
      ctx.setTextColor(new Color("#FF4444"));
      ctx.setFont(Font.boldSystemFont(fontSize));
      ctx.drawTextInRect(curStr, new Rect(rect.x + 2, curY, 40, fontSize + 4));
      ctx.setTextColor(LABEL_COLOR);
      ctx.setFont(Font.systemFont(fontSize));
    }
  } else {
    ctx.drawTextInRect(maxStr, new Rect(rect.x + rect.width - 28, rect.y, 26, 10));
    ctx.drawTextInRect(minStr, new Rect(rect.x + rect.width - 28, rect.y + rect.height - 10, 26, 10));
  }
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

function drawFilledArea(ctx, data, yMin, yMax, rect, color, opacity) {
  if (data.every(v => v == null)) return;
  const fillColor = new Color(color.hex, opacity != null ? opacity : 0.3);
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

function renderForecastGraph(dataset, startIdx, count, pageIndex) {
  const W = 720;
  const H = 370;
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
  const timeLabel = pageIndex === 0 ? "now" : `+${pageIndex * CONFIG.HOURS_PER_PAGE}h`;
  ctx.setFont(Font.boldSystemFont(13));
  ctx.setTextColor(TEXT_COLOR);
  ctx.drawTextInRect(
    `Foxtown ${timeLabel}`,
    new Rect(MARGIN_L + 2, 4, PLOT_W, 18)
  );

  // Strip definitions: { key(s), label, type, height }
  const strips = [
    {
      height: 100, type: "multi-line",
      series: [
        { data: sliceData("windSpeed"), color: SERIES[2].color, width: 1, fill: true, fixedYMin: 0, fixedYMax: 100, fillOpacity: 0.12 },
        { data: sliceData("temperature"), color: SERIES[0].color, width: 2 },
        { data: sliceData("windChill"),   color: SERIES[1].color, width: 1 },
      ],
    },
    {
      height: 80, type: "multi-line",
      yMin: 0, yMax: 100,
      series: [
        { data: sliceData("skyCover"),   color: SERIES[3].color, width: 1.5, fill: true },
        { data: sliceData("precipProb"), color: SERIES[4].color, width: 2 },
        { data: sliceData("humidity"),   color: SERIES[5].color, width: 1.5 },
      ],
      legend: [
        { text: "Sky Cover", color: SERIES[3].color },
        { text: "Precipitation Probability", color: SERIES[4].color },
        { text: "Relative Humidity", color: SERIES[5].color },
      ],
    },
    {
      height: 50, type: "bar",
      data: sliceData("rain"), color: SERIES[6].color, showAccum: true,
      legend: [{ text: `Rain ${accumTotal(sliceData("rain"))} inches`, color: SERIES[6].color }],
    },
    {
      height: 50, type: "bar",
      data: sliceData("snow"), color: SERIES[7].color, showAccum: true,
      legend: [{ text: `Snow ${accumTotal(sliceData("snow"))} inches`, color: SERIES[7].color }],
    },
  ];

  let y = 26;
  const GAP = 8;
  const SEP_H = 4;

  for (let si = 0; si < strips.length; si++) {
    const strip = strips[si];

    // Dark separator between strips
    if (si > 0) {
      ctx.setFillColor(new Color("#000000", 0.5));
      ctx.fillRect(new Rect(MARGIN_L, y - GAP + (GAP - SEP_H) / 2, PLOT_W, SEP_H));
    }

    const rect = new Rect(MARGIN_L, y, PLOT_W, strip.height);

    // Night shading
    drawNightShading(ctx, hours, rect);

    const plotRect = new Rect(rect.x, rect.y + 14, rect.width, rect.height - 14);

    if (strip.type === "multi-line") {
      const hasFixedRange = strip.yMin != null && strip.yMax != null;
      const sharedSeries = strip.series.filter(s => s.fixedYMin == null);
      const allVals = sharedSeries.flatMap(s => s.data).filter(v => v != null);
      const range = hasFixedRange ? { min: strip.yMin, max: strip.yMax } : autoRange(allVals, 0.1);
      drawHorizontalGrid(ctx, plotRect, range.min, range.max, 4);
      const currentVal = !hasFixedRange ? sharedSeries[0].data.find(v => v != null) : undefined;
      const dataMax = !hasFixedRange ? Math.max(...allVals) : undefined;
      const dataMin = !hasFixedRange ? Math.min(...allVals) : undefined;
      const yLabelOpts = hasFixedRange ? {} : { side: "left", fontSize: 14, currentVal, dataMax, dataMin };
      drawYLabels(ctx, range.min, range.max, plotRect, yLabelOpts);
      for (const s of strip.series) {
        const sYMin = s.fixedYMin != null ? s.fixedYMin : range.min;
        const sYMax = s.fixedYMax != null ? s.fixedYMax : range.max;
        if (s.fill) {
          drawFilledArea(ctx, s.data, sYMin, sYMax, plotRect, s.color, s.fillOpacity);
        } else {
          drawLineChart(ctx, s.data, sYMin, sYMax, plotRect, s.color, s.width);
        }
      }
      // Legend (top-right)
      const legends = strip.legend || [
        { text: "Temperature (°F)", color: SERIES[0].color },
        { text: "Wind Chill (°F)", color: SERIES[1].color },
      ];
      drawLegend(ctx, legends, rect);
    } else if (strip.type === "bar") {
      const yMin = strip.yMin != null ? strip.yMin : 0;
      const yMax = strip.yMax != null ? strip.yMax : (autoRange(strip.data, 0.1).max || 1);
      drawHorizontalGrid(ctx, plotRect, yMin, yMax, 4);
      drawBarChart(ctx, strip.data, yMin, yMax, plotRect, strip.color);
      if (strip.legend) drawLegend(ctx, strip.legend, rect);
      if (strip.showAccum) {
        ctx.setFont(Font.systemFont(6));
        ctx.setTextColor(LABEL_COLOR);
        const barW = plotRect.width / strip.data.length;
        for (let i = 0; i < strip.data.length; i++) {
          if (strip.data[i] != null && strip.data[i] > 0) {
            const val = strip.data[i];
            const label = val < 0.1 ? val.toFixed(2) : val.toFixed(1);
            const yFrac = Math.min((val - yMin) / (yMax - yMin), 1);
            const barY = plotRect.y + plotRect.height - yFrac * plotRect.height;
            ctx.drawTextInRect(label, new Rect(plotRect.x + i * barW - 4, barY - 9, barW + 8, 9));
          }
        }
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
      if (strip.windDir) {
        drawWindDirectionLabels(ctx, strip.windDir, hours, plotRect);
      }
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

  const img = renderForecastGraph(dataset, startIdx, count, 0);

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

  for (let start = firstIdx, pi = 0; start < totalHours; start += pageSize, pi++) {
    const count = Math.min(pageSize, totalHours - start);
    if (count < 6) break; // Skip tiny leftover pages

    const img = renderForecastGraph(dataset, start, count, pi);
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
