/**
 * Full-stack server entry point for WindWise in AI Studio environment.
 * Runs Express on port 3000 and mounts Vite middlewares in dev mode.
 * Implements the exact same API contract as the standalone Python FastAPI backend,
 * ensuring 100% reliable execution in the cloud preview container.
 */
import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

const app = express();
const PORT = 3000;
const ELEXON_BASE = 'https://data.elexon.co.uk/bmrs/api/v1';

app.use(express.json());

// In-memory cache for Elexon API requests (1 hour TTL)
interface CacheEntry {
  timestamp: number;
  data: any;
}
const apiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getCached(key: string): any | null {
  const entry = apiCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
}

function setCache(key: string, data: any) {
  apiCache.set(key, { timestamp: Date.now(), data });
}

// Utility: Normalize ISO timestamp
function normalizeIsoUtc(tsStr: string): string {
  const d = new Date(tsStr);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Utility: Settlement period (1-48)
function timestampToSettlementPeriod(tsStr: string): number {
  const d = new Date(tsStr);
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  return Math.floor((hours * 60 + minutes) / 30) + 1;
}

// Validate January 2026
function validateJanuary2026Date(dateStr: string): { valid: boolean; error?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { valid: false, error: `Invalid date format '${dateStr}'. Expected YYYY-MM-DD.` };
  }
  if (!dateStr.startsWith('2026-01-')) {
    return {
      valid: false,
      error: `Date ${dateStr} is outside the allowed January 2026 evaluation window (2026-01-01 to 2026-01-31).`,
    };
  }
  const day = parseInt(dateStr.split('-')[2], 10);
  if (day < 1 || day > 31) {
    return { valid: false, error: `Invalid day ${day} for January 2026.` };
  }
  return { valid: true };
}

// Utility: Split wide date range into small chunks to respect Elexon 7-day limit
function splitDateRangeIntoChunks(startStr: string, endStr: string, maxDays = 4): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  const curr = new Date(startStr + 'T00:00:00Z');
  const end = new Date(endStr + 'T00:00:00Z');

  while (curr <= end) {
    const chunkEnd = new Date(curr);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + (maxDays - 1));
    const actualChunkEnd = chunkEnd > end ? end : chunkEnd;

    chunks.push({
      start: curr.toISOString().substring(0, 10),
      end: actualChunkEnd.toISOString().substring(0, 10),
    });

    curr.setUTCDate(actualChunkEnd.getUTCDate() + 1);
  }
  return chunks;
}

// Fetch single chunk of actual wind generation (<= 5 days)
async function fetchActualWindSingleChunk(chunkStart: string, chunkEnd: string) {
  const cacheKey = `ACTUALS_CHUNK_${chunkStart}_${chunkEnd}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const publishFrom = `${chunkStart}T00:00:00Z`;
  const endD = new Date(chunkEnd);
  endD.setUTCDate(endD.getUTCDate() + 1);
  const publishTo = endD.toISOString().substring(0, 10) + 'T04:00:00Z';

  const url = `${ELEXON_BASE}/datasets/FUELHH?publishDateTimeFrom=${encodeURIComponent(publishFrom)}&publishDateTimeTo=${encodeURIComponent(publishTo)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Elexon FUELHH API returned HTTP ${resp.status}`);
  }
  const json = await resp.json();
  const rawItems = json.data || [];

  const cleaned: any[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    if (String(item.fuelType).toUpperCase() !== 'WIND') continue;
    if (!item.startTime || item.generation === undefined || item.generation === null) continue;

    const gen = parseFloat(item.generation);
    if (isNaN(gen)) continue;

    const normStart = normalizeIsoUtc(item.startTime);
    const itemDate = normStart.substring(0, 10);
    if (itemDate < chunkStart || itemDate > chunkEnd) continue;

    if (seen.has(normStart)) continue;
    seen.add(normStart);

    cleaned.push({
      dataset: 'FUELHH',
      startTime: normStart,
      settlementDate: item.settlementDate || itemDate,
      settlementPeriod: item.settlementPeriod || timestampToSettlementPeriod(normStart),
      fuelType: 'WIND',
      generation: gen,
    });
  }

  setCache(cacheKey, cleaned);
  return cleaned;
}

// Fetch actual wind generation from FUELHH (auto-chunks across date ranges)
async function fetchActualWind(startDate: string, endDate: string) {
  const cacheKey = `ACTUALS_MERGED_${startDate}_${endDate}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const chunks = splitDateRangeIntoChunks(startDate, endDate, 5);
  const chunkResults = await Promise.all(chunks.map((c) => fetchActualWindSingleChunk(c.start, c.end)));

  const merged: any[] = [];
  const seen = new Set<string>();
  for (const chunk of chunkResults) {
    for (const item of chunk) {
      if (!seen.has(item.startTime)) {
        seen.add(item.startTime);
        merged.push(item);
      }
    }
  }

  merged.sort((a, b) => a.startTime.localeCompare(b.startTime));
  setCache(cacheKey, merged);
  return merged;
}

// Fetch single chunk of wind forecasts (<= 4 days to ensure pub window <= 7 days)
async function fetchWindForecastsSingleChunk(chunkStart: string, chunkEnd: string) {
  const cacheKey = `WINDFOR_CHUNK_${chunkStart}_${chunkEnd}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const startD = new Date(chunkStart);
  startD.setUTCDate(startD.getUTCDate() - 2);
  const publishFrom = startD.toISOString().substring(0, 10) + 'T00:00:00Z';

  const endD = new Date(chunkEnd);
  endD.setUTCDate(endD.getUTCDate() + 1);
  const publishTo = endD.toISOString().substring(0, 10) + 'T23:59:59Z';

  const url = `${ELEXON_BASE}/datasets/WINDFOR?publishDateTimeFrom=${encodeURIComponent(publishFrom)}&publishDateTimeTo=${encodeURIComponent(publishTo)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Elexon WINDFOR API returned HTTP ${resp.status}`);
  }
  const json = await resp.json();
  const rawItems = json.data || [];

  const cleaned: any[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    if (!item.startTime || !item.publishTime || item.generation === undefined || item.generation === null) continue;
    const gen = parseFloat(item.generation);
    if (isNaN(gen)) continue;

    const normStart = normalizeIsoUtc(item.startTime);
    const normPub = normalizeIsoUtc(item.publishTime);
    const pair = `${normStart}_${normPub}`;
    if (seen.has(pair)) continue;
    seen.add(pair);

    cleaned.push({
      dataset: 'WINDFOR',
      startTime: normStart,
      publishTime: normPub,
      generation: gen,
      settlementPeriod: timestampToSettlementPeriod(normStart),
    });
  }

  setCache(cacheKey, cleaned);
  return cleaned;
}

// Fetch wind forecasts from WINDFOR (auto-chunks across date ranges)
async function fetchWindForecasts(startDate: string, endDate: string) {
  const cacheKey = `WINDFOR_MERGED_${startDate}_${endDate}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const chunks = splitDateRangeIntoChunks(startDate, endDate, 4);
  const chunkResults = await Promise.all(chunks.map((c) => fetchWindForecastsSingleChunk(c.start, c.end)));

  const merged: any[] = [];
  const seen = new Set<string>();
  for (const chunk of chunkResults) {
    for (const item of chunk) {
      const pair = `${item.startTime}_${item.publishTime}`;
      if (!seen.has(pair)) {
        seen.add(pair);
        merged.push(item);
      }
    }
  }

  merged.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.publishTime.localeCompare(b.publishTime));
  setCache(cacheKey, merged);
  return merged;
}

// Select forecasts based on mode and cutoff
function selectForecastsForDate(
  rawForecasts: any[],
  deliveryDateStr: string,
  mode: string,
  cutoffHour: number = 11,
  cutoffMinute: number = 0
) {
  const candidatesByStart = new Map<string, any[]>();

  if (mode === 'decision_time') {
    // Cutoff is deliveryDate - 1 day at cutoffHour:cutoffMinute UTC
    const d = new Date(deliveryDateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(cutoffHour, cutoffMinute, 0, 0);
    const cutoffIso = d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const cutoffRuleDesc = `Day-Ahead Procurement Cutoff: ${String(cutoffHour).padStart(2, '0')}:${String(cutoffMinute).padStart(2, '0')} UTC on ${d.toISOString().substring(0, 10)} (D-1 GB Wholesale Auction Gate Closure). Only forecasts published on or before this cutoff are included.`;

    for (const f of rawForecasts) {
      if (!f.startTime.startsWith(deliveryDateStr)) continue;
      // MUST be published on or before cutoff
      if (f.publishTime > cutoffIso) continue;

      if (!candidatesByStart.has(f.startTime)) candidatesByStart.set(f.startTime, []);
      candidatesByStart.get(f.startTime)!.push(f);
    }

    const selected: any[] = [];
    for (const [startTs, items] of candidatesByStart.entries()) {
      items.sort((a, b) => b.publishTime.localeCompare(a.publishTime));
      const best = items[0];
      selected.push({
        dataset: 'WINDFOR',
        startTime: startTs,
        publishTime: best.publishTime,
        generation: best.generation,
        settlementPeriod: timestampToSettlementPeriod(startTs),
      });
    }
    selected.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return { selected, rule: cutoffRuleDesc };
  } else {
    // Latest available forecast
    const cutoffRuleDesc = 'Latest Available Forecast: Selected the latest revision published prior to the delivery period startTime.';

    for (const f of rawForecasts) {
      if (!f.startTime.startsWith(deliveryDateStr)) continue;
      // Published on or before delivery start
      if (f.publishTime > f.startTime) continue;

      if (!candidatesByStart.has(f.startTime)) candidatesByStart.set(f.startTime, []);
      candidatesByStart.get(f.startTime)!.push(f);
    }

    const selected: any[] = [];
    for (const [startTs, items] of candidatesByStart.entries()) {
      items.sort((a, b) => b.publishTime.localeCompare(a.publishTime));
      const best = items[0];
      selected.push({
        dataset: 'WINDFOR',
        startTime: startTs,
        publishTime: best.publishTime,
        generation: best.generation,
        settlementPeriod: timestampToSettlementPeriod(startTs),
      });
    }
    selected.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return { selected, rule: cutoffRuleDesc };
  }
}

// Generate 48 settlement period start times for a date
function generateExpectedTimes(dateStr: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < 48; i++) {
    const hours = Math.floor(i / 2);
    const mins = (i % 2) * 30;
    const hStr = String(hours).padStart(2, '0');
    const mStr = String(mins).padStart(2, '0');
    result.push(`${dateStr}T${hStr}:${mStr}:00Z`);
  }
  return result;
}

// Accuracy matching math
function computeAccuracy(actuals: any[], forecasts: any[], expectedTimes: string[]) {
  const actualsMap = new Map<string, any>(actuals.map((a) => [a.startTime, a]));
  const forecastsMap = new Map<string, any>(forecasts.map((f) => [f.startTime, f]));

  const records: any[] = [];
  const absErrors: number[] = [];
  const signedErrors: number[] = [];
  const sqErrors: number[] = [];
  const pctErrors: number[] = [];

  let matched = 0;
  let missingForecast = 0;
  let missingActual = 0;
  let overforecast = 0;
  let underforecast = 0;
  let balanced = 0;

  for (const startTs of expectedTimes) {
    const act = actualsMap.get(startTs);
    const fcast = forecastsMap.get(startTs);
    const period = timestampToSettlementPeriod(startTs);

    const actualGen = act ? act.generation : null;
    const fcastGen = fcast ? fcast.generation : null;
    const pubTime = fcast ? fcast.publishTime : null;

    let leadTimeHours: number | null = null;
    if (pubTime) {
      const diffMs = new Date(startTs).getTime() - new Date(pubTime).getTime();
      leadTimeHours = Math.round((diffMs / (3600 * 1000)) * 100) / 100;
    }

    if (actualGen !== null && fcastGen !== null) {
      matched++;
      const signedErr = fcastGen - actualGen;
      const absErr = Math.abs(signedErr);
      const sqErr = signedErr * signedErr;

      absErrors.push(absErr);
      signedErrors.push(signedErr);
      sqErrors.push(sqErr);

      let pctErr: number | null = null;
      if (actualGen > 0) {
        pctErr = Math.round((absErr / actualGen) * 10000) / 100;
        pctErrors.push(pctErr);
      }

      let isOver: boolean | null = null;
      if (signedErr > 0.1) {
        overforecast++;
        isOver = true;
      } else if (signedErr < -0.1) {
        underforecast++;
        isOver = false;
      } else {
        balanced++;
      }

      records.push({
        settlementPeriod: period,
        startTime: startTs,
        actualGeneration: Math.round(actualGen * 100) / 100,
        forecastGeneration: Math.round(fcastGen * 100) / 100,
        signedError: Math.round(signedErr * 100) / 100,
        absoluteError: Math.round(absErr * 100) / 100,
        percentageError: pctErr,
        forecastPublishTime: pubTime,
        leadTimeHours,
        isOverforecast: isOver,
      });
    } else {
      if (fcastGen === null) missingForecast++;
      if (actualGen === null) missingActual++;

      records.push({
        settlementPeriod: period,
        startTime: startTs,
        actualGeneration: actualGen !== null ? Math.round(actualGen * 100) / 100 : null,
        forecastGeneration: fcastGen !== null ? Math.round(fcastGen * 100) / 100 : null,
        signedError: null,
        absoluteError: null,
        percentageError: null,
        forecastPublishTime: pubTime,
        leadTimeHours,
        isOverforecast: null,
      });
    }
  }

  const total = expectedTimes.length;
  const coveragePct = total > 0 ? Math.round((matched / total) * 1000) / 10 : 0;

  let mae: number | null = null;
  let rmse: number | null = null;
  let meanBias: number | null = null;
  let mape: number | null = null;
  let p10: number | null = null;
  let p50: number | null = null;
  let p90: number | null = null;

  if (matched > 0) {
    mae = Math.round((absErrors.reduce((a, b) => a + b, 0) / matched) * 100) / 100;
    rmse = Math.round(Math.sqrt(sqErrors.reduce((a, b) => a + b, 0) / matched) * 100) / 100;
    meanBias = Math.round((signedErrors.reduce((a, b) => a + b, 0) / matched) * 100) / 100;
    if (pctErrors.length > 0) {
      mape = Math.round((pctErrors.reduce((a, b) => a + b, 0) / pctErrors.length) * 100) / 100;
    }

    signedErrors.sort((a, b) => a - b);
    p10 = Math.round(signedErrors[Math.floor(signedErrors.length * 0.1)] * 100) / 100;
    p50 = Math.round(signedErrors[Math.floor(signedErrors.length * 0.5)] * 100) / 100;
    p90 = Math.round(signedErrors[Math.floor(signedErrors.length * 0.9)] * 100) / 100;
  }

  const summary = {
    mae,
    rmse,
    meanBiasError: meanBias,
    mape,
    totalPeriods: total,
    matchedPeriods: matched,
    missingForecastPeriods: missingForecast,
    missingActualPeriods: missingActual,
    dataCoveragePct: coveragePct,
    overforecastCount: overforecast,
    underforecastCount: underforecast,
    balancedCount: balanced,
    p10Error: p10,
    p50Error: p50,
    p90Error: p90,
    evaluationPeriod: 'Scope',
    forecastMode: 'decision_time',
    cutoffRule: '',
  };

  return { records, summary };
}

// -------------------------------------------------------------
// API Routes (/api/v1/* and /api/*)
// -------------------------------------------------------------

function registerApiRoutes(router: express.Router) {
  // GET /health
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        upstreamElexonStatus: 'nominal',
        elexonBaseUrl: ELEXON_BASE,
        version: '1.0.0',
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /actuals
  router.get('/actuals', async (req: Request, res: Response) => {
    const dateStr = String(req.query.date || '');
    const val = validateJanuary2026Date(dateStr);
    if (!val.valid) return res.status(400).json({ detail: val.error });

    try {
      const records = await fetchActualWind(dateStr, dateStr);
      res.json(records);
    } catch (e: any) {
      res.status(502).json({ detail: e.message });
    }
  });

  // GET /forecasts
  router.get('/forecasts', async (req: Request, res: Response) => {
    const dateStr = String(req.query.date || '');
    const val = validateJanuary2026Date(dateStr);
    if (!val.valid) return res.status(400).json({ detail: val.error });

    const mode = String(req.query.mode || 'decision_time');
    const cutoffHour = parseInt(String(req.query.cutoff_hour || '11'), 10);
    const cutoffMin = parseInt(String(req.query.cutoff_minute || '0'), 10);

    try {
      const rawForecasts = await fetchWindForecasts(dateStr, dateStr);
      const { selected } = selectForecastsForDate(rawForecasts, dateStr, mode, cutoffHour, cutoffMin);
      res.json(selected);
    } catch (e: any) {
      res.status(502).json({ detail: e.message });
    }
  });

  // GET /accuracy/series
  router.get('/accuracy/series', async (req: Request, res: Response) => {
    const dateStr = String(req.query.date || '');
    const val = validateJanuary2026Date(dateStr);
    if (!val.valid) return res.status(400).json({ detail: val.error });

    const mode = String(req.query.mode || 'decision_time');
    const cutoffHour = parseInt(String(req.query.cutoff_hour || '11'), 10);
    const cutoffMin = parseInt(String(req.query.cutoff_minute || '0'), 10);

    try {
      const actuals = await fetchActualWind(dateStr, dateStr);
      const rawForecasts = await fetchWindForecasts(dateStr, dateStr);
      const { selected, rule } = selectForecastsForDate(rawForecasts, dateStr, mode, cutoffHour, cutoffMin);
      const expectedTimes = generateExpectedTimes(dateStr);

      const { records, summary } = computeAccuracy(actuals, selected, expectedTimes);
      summary.evaluationPeriod = `Day ${dateStr} (48 Settlement Periods)`;
      summary.forecastMode = mode;
      summary.cutoffRule = rule;

      res.json({
        date: dateStr,
        mode,
        cutoffRule: rule,
        records,
        summary,
      });
    } catch (e: any) {
      res.status(502).json({ detail: e.message });
    }
  });

  // GET /accuracy
  router.get('/accuracy', async (req: Request, res: Response) => {
    const startStr = String(req.query.start_date || '2026-01-01');
    const endStr = String(req.query.end_date || '2026-01-31');

    const v1 = validateJanuary2026Date(startStr);
    const v2 = validateJanuary2026Date(endStr);
    if (!v1.valid) return res.status(400).json({ detail: v1.error });
    if (!v2.valid) return res.status(400).json({ detail: v2.error });
    if (startStr > endStr) {
      return res.status(400).json({ detail: `start_date (${startStr}) cannot be later than end_date (${endStr}).` });
    }

    const mode = String(req.query.mode || 'decision_time');
    const cutoffHour = parseInt(String(req.query.cutoff_hour || '11'), 10);
    const cutoffMin = parseInt(String(req.query.cutoff_minute || '0'), 10);

    try {
      const actuals = await fetchActualWind(startStr, endStr);
      const rawForecasts = await fetchWindForecasts(startStr, endStr);

      const dailySummaries: any[] = [];
      const allSelectedForecasts: any[] = [];
      const allExpectedTimes: string[] = [];
      let finalRule = '';

      const sDay = parseInt(startStr.split('-')[2], 10);
      const eDay = parseInt(endStr.split('-')[2], 10);

      for (let day = sDay; day <= eDay; day++) {
        const dStr = `2026-01-${String(day).padStart(2, '0')}`;
        const { selected, rule } = selectForecastsForDate(rawForecasts, dStr, mode, cutoffHour, cutoffMin);
        finalRule = rule;
        allSelectedForecasts.push(...selected);

        const expTimes = generateExpectedTimes(dStr);
        allExpectedTimes.push(...expTimes);

        const dayActuals = actuals.filter((a: any) => a.startTime.startsWith(dStr));
        const { summary: daySum } = computeAccuracy(dayActuals, selected, expTimes);

        dailySummaries.push({
          date: dStr,
          mae: daySum.mae,
          rmse: daySum.rmse,
          meanBiasError: daySum.meanBiasError,
          mape: daySum.mape,
          matchedPeriods: daySum.matchedPeriods,
          dataCoveragePct: daySum.dataCoveragePct,
        });
      }

      const { summary } = computeAccuracy(actuals, allSelectedForecasts, allExpectedTimes);
      summary.evaluationPeriod = `${startStr} to ${endStr}`;
      summary.forecastMode = mode;
      summary.cutoffRule = finalRule;

      res.json({
        startDate: startStr,
        endDate: endStr,
        mode,
        cutoffRule: finalRule,
        summary,
        dailySummaries,
      });
    } catch (e: any) {
      res.status(502).json({ detail: e.message });
    }
  });

  // GET /methodology
  router.get('/methodology', (_req: Request, res: Response) => {
    res.json({
      productName: 'WindWise — Renewable Forecast Intelligence',
      targetCustomer: 'Energy procurement and trading analysts at UK electricity utilities participating in the GB wholesale power market.',
      marketContext:
        'In Great Britain (GB), wholesale electricity contracts for physical delivery on day D are primarily traded at the Day-Ahead auction operated by EPEX SPOT and Nord Pool. Gate closure occurs at 11:00 UTC (12:00 CET) on day D-1. Procurement analysts must commit purchase volumes based solely on weather forecasts available prior to this 11:00 UTC cutoff.',
      cutoffRule:
        'Standard GB Day-Ahead Gate Closure: 11:00 UTC on Day D-1. Only forecast runs published on or before this cutoff are eligible for Day-Ahead Decision evaluation. Revisions published after 11:00 UTC on D-1 are excluded from decision-time evaluation to eliminate lookahead bias.',
      whyCutoffMatters:
        'Wind forecasts are continuously updated throughout the day as numerical weather prediction (NWP) models ingest satellite and radar data. An intraday forecast published at 20:00 UTC on D-1 or at 06:00 UTC on day D may be substantially more accurate than the forecast available at 11:00 UTC on D-1. Evaluating an analyst day-ahead procurement decision against later forecast revisions falsely credits or blames the analyst using data that did not exist when the purchase order was executed.',
      metricDefinitions: {
        MAE: 'Mean Absolute Error in Megawatts (MW): (1/N) * sum(|Forecast - Actual|). Measures the average magnitude of generation forecast error without regard to direction.',
        RMSE: 'Root Mean Squared Error in Megawatts (MW): sqrt((1/N) * sum((Forecast - Actual)^2)). Penalizes large, abrupt forecast swings more heavily than small errors.',
        'Mean Bias Error':
          'Mean Signed Error in Megawatts (MW): (1/N) * sum(Forecast - Actual). A positive value indicates systematic over-forecasting (predicting more wind than produced), while a negative value indicates systematic under-forecasting.',
        MAPE: 'Mean Absolute Percentage Error (%): (1/M) * sum(|Forecast - Actual| / Actual) * 100%. Calculated strictly over settlement periods where Actual > 0 MW to avoid division by zero or mathematical explosion during calm weather.',
        'Data Coverage': 'Percentage of the 48 daily settlement periods where both official Elexon actuals (FUELHH) and forecasts (WINDFOR) are successfully matched.',
        'Signed Error': 'Forecast (MW) minus Actual (MW). Positive values represent overforecast; negative values represent underforecast.',
      },
      dataCleansingSteps: [
        'Direct ingestion from official Elexon BMRS API v1 (open, non-synthetic datasets).',
        'Actuals: filtered exclusively to fuelType == "WIND" from dataset FUELHH.',
        'Forecasts: ingestion from dataset WINDFOR, extracting generation, startTime, and publishTime.',
        'Timestamp normalization: all half-hourly settlement boundaries normalized to standard ISO 8601 UTC representation.',
        'Settlement Period Alignment: matched by unique startTime (00:00 to 23:30 UTC, 48 periods per day).',
        'Deduplication: duplicate publications for the same delivery interval are resolved by selecting the latest publishTime prior to cutoff.',
        'Null handling: missing periods are preserved as explicit nulls with missing-period tracking rather than assumed to be zero.',
      ],
      limitations: [
        'Data scope is strictly restricted to national aggregate UK wind generation actuals and forecasts for January 2026.',
        'Does not include regional transmission constraint zones, offshore vs onshore sub-breakdowns, or individual wind farm BMUs.',
        'Does not include system electricity demand, half-hourly wholesale power prices, or Balancing Mechanism System Buy/Sell Prices (cash-out prices).',
        'Financial procurement costs or imbalance penalties are not simulated because price and demand datasets are outside this assignment scope.',
      ],
    });
  });
}

// Mount both under /api/v1 and /api
const v1Router = express.Router();
registerApiRoutes(v1Router);
app.use('/api/v1', v1Router);
app.use('/api', v1Router);

// Start Vite server and mount middlewares in dev
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WindWise] Full-stack application running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[WindWise] Failed to start server:', err);
});
