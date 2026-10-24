/**
 * API service client for WindWise backend.
 * Reads base URL from VITE_API_BASE_URL (defaults to empty string for relative proxy).
 */
import {
  AccuracySeriesResponse,
  AggregateAccuracyResponse,
  ForecastMode,
  HealthResponse,
  MethodologyResponse,
  WindActualRecord,
  WindForecastRecord,
} from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }
  return res.json();
}

export const api = {
  async getHealth(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE}/api/v1/health`);
    return handleResponse<HealthResponse>(res);
  },

  async getAccuracySeries(
    date: string,
    mode: ForecastMode = 'decision_time',
    cutoffHour: number = 11,
    cutoffMinute: number = 0
  ): Promise<AccuracySeriesResponse> {
    const params = new URLSearchParams({
      date,
      mode,
      cutoff_hour: cutoffHour.toString(),
      cutoff_minute: cutoffMinute.toString(),
    });
    const res = await fetch(`${API_BASE}/api/v1/accuracy/series?${params.toString()}`);
    return handleResponse<AccuracySeriesResponse>(res);
  },

  async getAggregateAccuracy(
    startDate: string = '2026-01-01',
    endDate: string = '2026-01-31',
    mode: ForecastMode = 'decision_time',
    cutoffHour: number = 11,
    cutoffMinute: number = 0
  ): Promise<AggregateAccuracyResponse> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      mode,
      cutoff_hour: cutoffHour.toString(),
      cutoff_minute: cutoffMinute.toString(),
    });
    const res = await fetch(`${API_BASE}/api/v1/accuracy?${params.toString()}`);
    return handleResponse<AggregateAccuracyResponse>(res);
  },

  async getActuals(date: string): Promise<WindActualRecord[]> {
    const res = await fetch(`${API_BASE}/api/v1/actuals?date=${encodeURIComponent(date)}`);
    return handleResponse<WindActualRecord[]>(res);
  },

  async getForecasts(
    date: string,
    mode: ForecastMode = 'decision_time',
    cutoffHour: number = 11
  ): Promise<WindForecastRecord[]> {
    const params = new URLSearchParams({
      date,
      mode,
      cutoff_hour: cutoffHour.toString(),
    });
    const res = await fetch(`${API_BASE}/api/v1/forecasts?${params.toString()}`);
    return handleResponse<WindForecastRecord[]>(res);
  },

  async getMethodology(): Promise<MethodologyResponse> {
    const res = await fetch(`${API_BASE}/api/v1/methodology`);
    return handleResponse<MethodologyResponse>(res);
  },
};
