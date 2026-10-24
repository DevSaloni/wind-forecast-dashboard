/**
 * Type definitions for WindWise — Renewable Forecast Intelligence.
 */

export interface WindActualRecord {
  dataset: string;
  startTime: string;
  settlementDate: string;
  settlementPeriod: number;
  fuelType: string;
  generation: number;
}

export interface WindForecastRecord {
  dataset: string;
  startTime: string;
  publishTime: string;
  generation: number;
  settlementPeriod?: number;
}

export interface MatchedSettlementRecord {
  settlementPeriod: number;
  startTime: string;
  actualGeneration: number | null;
  forecastGeneration: number | null;
  signedError: number | null;
  absoluteError: number | null;
  percentageError: number | null;
  forecastPublishTime: string | null;
  leadTimeHours: number | null;
  isOverforecast: boolean | null;
}

export interface AccuracyMetrics {
  mae: number | null;
  rmse: number | null;
  meanBiasError: number | null;
  mape: number | null;
  totalPeriods: number;
  matchedPeriods: number;
  missingForecastPeriods: number;
  missingActualPeriods: number;
  dataCoveragePct: number;
  overforecastCount: number;
  underforecastCount: number;
  balancedCount: number;
  p10Error: number | null;
  p50Error: number | null;
  p90Error: number | null;
  evaluationPeriod: string;
  forecastMode: string;
  cutoffRule: string;
}

export interface DailyAccuracySummary {
  date: string;
  mae: number | null;
  rmse: number | null;
  meanBiasError: number | null;
  mape: number | null;
  matchedPeriods: number;
  dataCoveragePct: number;
}

export interface AccuracySeriesResponse {
  date: string;
  mode: string;
  cutoffRule: string;
  records: MatchedSettlementRecord[];
  summary: AccuracyMetrics;
}

export interface AggregateAccuracyResponse {
  startDate: string;
  endDate: string;
  mode: string;
  cutoffRule: string;
  summary: AccuracyMetrics;
  dailySummaries: DailyAccuracySummary[];
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  upstreamElexonStatus: string;
  elexonBaseUrl: string;
  version: string;
}

export interface MethodologyResponse {
  productName: string;
  targetCustomer: string;
  marketContext: string;
  cutoffRule: string;
  whyCutoffMatters: string;
  metricDefinitions: Record<string, string>;
  dataCleansingSteps: string[];
  limitations: string[];
}

export type ForecastMode = 'decision_time' | 'latest';
export type NavigationPage = 'overview' | 'explorer' | 'accuracy' | 'methodology';
