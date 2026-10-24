import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ArrowRight,
  Eye,
} from 'lucide-react';
import { AccuracySeriesResponse, ForecastMode, NavigationPage } from '../types';
import { KpiCard } from '../components/KpiCard';

interface ExecutiveOverviewProps {
  seriesData: AccuracySeriesResponse | null;
  loading: boolean;
  error: string | null;
  forecastMode: ForecastMode;
  onPageChange: (page: NavigationPage) => void;
  onRetry: () => void;
}

export const ExecutiveOverview: React.FC<ExecutiveOverviewProps> = ({
  seriesData,
  loading,
  error,
  forecastMode,
  onPageChange,
  onRetry,
}) => {
  const [showErrorRibbon, setShowErrorRibbon] = useState(true);

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 bg-slate-200/70 rounded-md w-72 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-100 rounded-xl border border-slate-200/80 animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-slate-100 rounded-xl border border-slate-200 animate-pulse" />
      </div>
    );
  }

  if (error || !seriesData) {
    return (
      <div className="p-12 text-center max-w-xl mx-auto space-y-4">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Unable to load forecast intelligence</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          {error || 'No forecast records were returned for this date and cutoff.'}
        </p>
        <button
          onClick={onRetry}
          className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
        >
          Retry Retrieval
        </button>
      </div>
    );
  }

  const { summary, records, cutoffRule, date } = seriesData;

  // Format chart records
  const chartData = records.map((r) => {
    // Format timestamp to HH:MM
    const timeLabel = r.startTime ? r.startTime.substring(11, 16) : `SP ${r.settlementPeriod}`;
    return {
      period: r.settlementPeriod,
      time: timeLabel,
      actual: r.actualGeneration,
      forecast: r.forecastGeneration,
      signedError: r.signedError,
      absError: r.absoluteError,
      pctError: r.percentageError,
      publishTime: r.forecastPublishTime ? r.forecastPublishTime.substring(11, 16) : null,
      publishDate: r.forecastPublishTime ? r.forecastPublishTime.substring(0, 10) : null,
      leadTimeHours: r.leadTimeHours,
    };
  });

  // Calculate morning peak (07:00-09:00, SP 15-18) and evening peak (16:30-19:00, SP 34-38)
  const morningRecords = records.filter((r) => r.settlementPeriod >= 15 && r.settlementPeriod <= 18);
  const eveningRecords = records.filter((r) => r.settlementPeriod >= 34 && r.settlementPeriod <= 38);

  const avgMorningError =
    morningRecords.length > 0
      ? morningRecords.reduce((acc, r) => acc + (r.signedError || 0), 0) / morningRecords.length
      : 0;

  const avgEveningError =
    eveningRecords.length > 0
      ? eveningRecords.reduce((acc, r) => acc + (r.signedError || 0), 0) / eveningRecords.length
      : 0;

  const biasSentiment =
    summary.meanBiasError === null
      ? 'neutral'
      : summary.meanBiasError > 500
      ? 'warning'
      : summary.meanBiasError < -500
      ? 'negative'
      : 'positive';

  const biasDirection =
    summary.meanBiasError !== null
      ? summary.meanBiasError > 0
        ? `Overforecast (+${summary.meanBiasError.toLocaleString()} MW)`
        : `Underforecast (${summary.meanBiasError.toLocaleString()} MW)`
      : 'Neutral';

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Decision Cutoff Context Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-emerald-800 shrink-0" />
          <div className="text-slate-700 leading-snug">
            <span className="font-semibold text-slate-900">Procurement Decision Basis:</span>{' '}
            {cutoffRule}
          </div>
        </div>
        <button
          onClick={() => onPageChange('methodology')}
          className="flex items-center gap-1 text-emerald-800 font-semibold hover:text-emerald-950 transition-colors whitespace-nowrap shrink-0"
        >
          <span>View Methodology</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="MAE (Mean Abs Error)"
          value={summary.mae !== null ? summary.mae.toLocaleString() : null}
          unit="MW"
          tooltip="Mean Absolute Error in Megawatts. Measures average error magnitude irrespective of direction. Lower is better."
          contextText="Average deviation per period"
        />
        <KpiCard
          title="RMSE (Root Mean Sq)"
          value={summary.rmse !== null ? summary.rmse.toLocaleString() : null}
          unit="MW"
          tooltip="Root Mean Squared Error. Heavily penalizes large sudden forecast errors that risk grid balancing instability."
          contextText="Quadratic penalty on large errors"
        />
        <KpiCard
          title="Mean Bias Error"
          value={summary.meanBiasError !== null ? (summary.meanBiasError > 0 ? `+${summary.meanBiasError}` : summary.meanBiasError) : null}
          unit="MW"
          sentiment={biasSentiment}
          tooltip="Signed Mean Error = Forecast minus Actual. Positive bias means the forecast was systematically higher than actual generation."
          contextText={biasDirection}
        />
        <KpiCard
          title="MAPE"
          value={summary.mape !== null ? `${summary.mape}%` : null}
          tooltip="Mean Absolute Percentage Error over periods with non-zero actual generation. Strictly handles calm periods without zero-division."
          contextText="Relative error vs actuals"
        />
        <KpiCard
          title="Matched Periods"
          value={`${summary.matchedPeriods} / ${summary.totalPeriods}`}
          unit="SPs"
          tooltip="Total half-hourly settlement periods on this day where both actual generation and forecast were matched."
          contextText={`${summary.missingForecastPeriods} missing forecasts`}
        />
        <KpiCard
          title="Data Coverage"
          value={`${summary.dataCoveragePct}%`}
          sentiment={summary.dataCoveragePct >= 95 ? 'positive' : 'warning'}
          tooltip="Percentage of the 48 target half-hourly settlement periods with validated Elexon data."
          contextText={summary.dataCoveragePct === 100 ? 'Full day verified' : 'Incomplete settlement data'}
        />
      </div>

      {/* Primary Forecast vs Actual Visualization */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Wind Generation: Actual vs. Forecasted Half-Hourly Profile
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Settlement day {date} · National UK Wind (Elexon BMRS FUELHH vs WINDFOR)
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => setShowErrorRibbon(!showErrorRibbon)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                showErrorRibbon
                  ? 'bg-slate-100 text-slate-900 border-slate-300'
                  : 'bg-white text-slate-500 border-slate-200 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{showErrorRibbon ? 'Hide Signed Error Bars' : 'Show Signed Error Bars'}</span>
            </button>
            <button
              onClick={() => onPageChange('explorer')}
              className="font-medium text-emerald-800 hover:text-emerald-950 transition-colors flex items-center gap-1"
            >
              <span>Inspect Table</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Recharts Composed Chart */}
        <div className="h-[420px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="time"
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                interval={3}
                tickFormatter={(val) => val}
              />
              <YAxis
                yAxisId="generation"
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${(val / 1000).toFixed(1)} GW`}
                domain={[0, 'auto']}
              />
              {showErrorRibbon && (
                <YAxis
                  yAxisId="error"
                  orientation="right"
                  stroke="#94A3B8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val > 0 ? '+' : ''}${val} MW`}
                />
              )}
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const data = payload[0].payload;
                  const signed = data.signedError;
                  const isOver = signed > 0;
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs space-y-1.5 font-sans min-w-[220px]">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="font-bold text-slate-900 font-mono">
                          {data.time} UTC (SP {data.period})
                        </span>
                        {data.leadTimeHours !== null && (
                          <span className="text-[11px] text-slate-500 font-mono">
                            {data.leadTimeHours}h lead
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 pt-0.5">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                            Actual Generation:
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {data.actual !== null ? `${data.actual.toLocaleString()} MW` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-950 inline-block" />
                            {forecastMode === 'decision_time' ? 'Decision Forecast:' : 'Latest Forecast:'}
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {data.forecast !== null ? `${data.forecast.toLocaleString()} MW` : 'N/A'}
                          </span>
                        </div>
                        {signed !== null && (
                          <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                            <span className="text-slate-600">Signed Error:</span>
                            <span
                              className={`font-mono font-bold ${
                                isOver ? 'text-amber-700' : 'text-rose-700'
                              }`}
                            >
                              {isOver ? `+${signed.toLocaleString()}` : signed.toLocaleString()} MW
                            </span>
                          </div>
                        )}
                        {data.pctError !== null && (
                          <div className="flex justify-between items-center text-slate-500">
                            <span>Percentage Error:</span>
                            <span className="font-mono font-medium">{data.pctError}%</span>
                          </div>
                        )}
                        {data.publishTime && (
                          <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                            Forecast Published: {data.publishDate} {data.publishTime} UTC
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="plainline"
                wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
              />
              <ReferenceLine yAxisId="generation" y={0} stroke="#CBD5E1" />

              {/* Actual Generation Series */}
              <Line
                yAxisId="generation"
                type="monotone"
                dataKey="actual"
                name="Actual Generation (FUELHH)"
                stroke="#059669"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#059669' }}
              />

              {/* Day-Ahead Decision Forecast Series */}
              <Line
                yAxisId="generation"
                type="monotone"
                dataKey="forecast"
                name={
                  forecastMode === 'decision_time'
                    ? 'Day-Ahead Decision Forecast (WINDFOR)'
                    : 'Latest Available Forecast (WINDFOR)'
                }
                stroke="#064E3B"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 5, fill: '#064E3B' }}
              />

              {/* Error Bar Ribbon */}
              {showErrorRibbon && (
                <Bar
                  yAxisId="error"
                  dataKey="signedError"
                  name="Signed Error (Forecast - Actual)"
                  fill="#CBD5E1"
                  opacity={0.6}
                  maxBarSize={8}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Domain Procurement Insights & Peak Windows */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Morning & Evening Peak Impact */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Wholesale Peak Delivery Windows</h3>
            <span className="text-[11px] font-mono text-slate-500">UK System Demand Peaks</span>
          </div>

          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-800">Morning Peak (07:00 – 09:00 UTC)</span>
                <span className="text-slate-500 font-mono text-[11px]">SPs 15–18</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-600">Average Signed Bias:</span>
                <span
                  className={`font-mono font-bold text-sm ${
                    avgMorningError > 0 ? 'text-amber-700' : 'text-rose-700'
                  }`}
                >
                  {avgMorningError > 0 ? `+${avgMorningError.toFixed(0)}` : avgMorningError.toFixed(0)} MW
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                {avgMorningError > 0
                  ? 'Overforecast: Surplus wind anticipated, procurement desk risked paying balancing shortfall penalties.'
                  : 'Underforecast: Additional merchant wind delivered, lowering net market exposure.'}
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-800">Evening Peak (16:30 – 19:00 UTC)</span>
                <span className="text-slate-500 font-mono text-[11px]">SPs 34–38</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-600">Average Signed Bias:</span>
                <span
                  className={`font-mono font-bold text-sm ${
                    avgEveningError > 0 ? 'text-amber-700' : 'text-rose-700'
                  }`}
                >
                  {avgEveningError > 0 ? `+${avgEveningError.toFixed(0)}` : avgEveningError.toFixed(0)} MW
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                {avgEveningError > 0
                  ? 'Overforecast during high wholesale power price hours compounds imbalance volume penalties.'
                  : 'Underforecast: Wind output exceeded day-ahead forecast during maximum system load.'}
              </p>
            </div>
          </div>
        </div>

        {/* Bias Breakdown & Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Forecast Bias Directionality</h3>
            <span className="text-[11px] font-mono text-slate-500">48 Settlement Intervals</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                Overforecast Periods (Forecast &gt; Actual):
              </span>
              <span className="font-mono font-bold text-slate-900">
                {summary.overforecastCount} ({Math.round((summary.overforecastCount / summary.totalPeriods) * 100)}%)
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                Underforecast Periods (Forecast &lt; Actual):
              </span>
              <span className="font-mono font-bold text-slate-900">
                {summary.underforecastCount} ({Math.round((summary.underforecastCount / summary.totalPeriods) * 100)}%)
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Balanced Periods (±0.1 MW):</span>
              <span className="font-mono font-bold text-slate-900">
                {summary.balancedCount}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>P10 Error (10th percentile):</span>
                <span className="font-mono font-semibold">{summary.p10Error !== null ? `${summary.p10Error} MW` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Median Error (P50):</span>
                <span className="font-mono font-semibold">{summary.p50Error !== null ? `${summary.p50Error} MW` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>P90 Error (90th percentile):</span>
                <span className="font-mono font-semibold">{summary.p90Error !== null ? `${summary.p90Error} MW` : '—'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Energy Procurement Rationale Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Why Decision Cutoff Timing Matters</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Wholesale trading desks submit binding auction orders on day D-1. Intraday forecasts published
              after 11:00 UTC often correct numerical weather prediction drifts, but cannot alter the
              contracted day-ahead procurement quantity.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Evaluating an analyst against latest forecasts falsely credits or blames them using data unavailable at the time the order was executed.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={() => onPageChange('accuracy')}
              className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
            >
              <span>Explore Accuracy Analysis</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
