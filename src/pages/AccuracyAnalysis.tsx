import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  BarChart2,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { AccuracySeriesResponse, AggregateAccuracyResponse, ForecastMode } from '../types';
import { api } from '../services/api';

interface AccuracyAnalysisProps {
  seriesData: AccuracySeriesResponse | null;
  forecastMode: ForecastMode;
  cutoffHour: number;
}

export const AccuracyAnalysis: React.FC<AccuracyAnalysisProps> = ({
  seriesData,
  forecastMode,
  cutoffHour,
}) => {
  const [aggregateData, setAggregateData] = useState<AggregateAccuracyResponse | null>(null);
  const [loadingAggregate, setLoadingAggregate] = useState(false);
  const [aggregateError, setAggregateError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadMonthlyAggregate() {
      setLoadingAggregate(true);
      setAggregateError(null);
      try {
        const res = await api.getAggregateAccuracy(
          '2026-01-01',
          '2026-01-31',
          forecastMode,
          cutoffHour
        );
        if (isMounted) {
          setAggregateData(res);
        }
      } catch (err: any) {
        if (isMounted) {
          setAggregateError(err.message || 'Failed to load month aggregate');
        }
      } finally {
        if (isMounted) {
          setLoadingAggregate(false);
        }
      }
    }

    loadMonthlyAggregate();
    return () => {
      isMounted = false;
    };
  }, [forecastMode, cutoffHour]);

  const records = seriesData?.records || [];
  const summary = seriesData?.summary;

  // 1. Error Distribution (Histogram Bins)
  const bins = [
    { label: '< -3 GW', min: -Infinity, max: -3000, count: 0 },
    { label: '-3 to -2 GW', min: -3000, max: -2000, count: 0 },
    { label: '-2 to -1 GW', min: -2000, max: -1000, count: 0 },
    { label: '-1 to 0 GW', min: -1000, max: 0, count: 0 },
    { label: '0 to +1 GW', min: 0, max: 1000, count: 0 },
    { label: '+1 to +2 GW', min: 1000, max: 2000, count: 0 },
    { label: '+2 to +3 GW', min: 2000, max: 3000, count: 0 },
    { label: '> +3 GW', min: 3000, max: Infinity, count: 0 },
  ];

  records.forEach((r) => {
    if (r.signedError !== null) {
      const b = bins.find((bin) => r.signedError! >= bin.min && r.signedError! < bin.max);
      if (b) b.count += 1;
    }
  });

  // 2. Scatter Plot Data: (Actual, Forecast)
  const scatterData = records
    .filter((r) => r.actualGeneration !== null && r.forecastGeneration !== null)
    .map((r) => ({
      x: r.actualGeneration,
      y: r.forecastGeneration,
      period: r.settlementPeriod,
      time: r.startTime.substring(11, 16),
      error: r.signedError,
    }));

  // Max value for scatter domain
  const maxScatterVal = Math.max(
    ...scatterData.map((d) => Math.max(d.x || 0, d.y || 0)),
    5000
  );

  // 3. Signed Error Time Series
  const errorTimeSeries = records.map((r) => ({
    time: r.startTime ? r.startTime.substring(11, 16) : `SP ${r.settlementPeriod}`,
    period: r.settlementPeriod,
    signedError: r.signedError,
    absError: r.absoluteError,
  }));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Info */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 tracking-tight">
          Quantitative Forecast Evaluation & Error Diagnostics
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Settlement date {seriesData?.date} · Evaluating{' '}
          <span className="font-semibold text-slate-700">
            {forecastMode === 'decision_time'
              ? `Day-Ahead Auction Cutoff (${cutoffHour}:00 UTC D-1)`
              : 'Latest Available Forecast'}
          </span>
        </p>
      </div>

      {/* Grid of Statistical Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart A: Error Distribution Histogram */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Signed Error Frequency Distribution</h3>
              <p className="text-[11px] text-slate-500">
                Binned half-hourly forecast deviations (MW)
              </p>
            </div>
            <span className="text-xs font-mono text-slate-600 font-semibold">
              Bias: {summary?.meanBiasError !== null ? `${summary?.meanBiasError} MW` : '—'}
            </span>
          </div>

          <div className="h-[280px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bins} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="label" stroke="#64748B" fontSize={10} interval={0} angle={-20} textAnchor="end" />
                <YAxis stroke="#64748B" fontSize={10} allowDecimals={false} />
                <Tooltip
                  formatter={(val: any) => [`${val} Settlement Periods`, 'Count']}
                  labelFormatter={(lbl) => `Error Bin: ${lbl}`}
                />
                <Bar dataKey="count" fill="#047857" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart B: Forecast vs Actual Scatter with 1:1 Reference Line */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Forecast vs. Actual Correlation</h3>
              <p className="text-[11px] text-slate-500">
                Points above the diagonal indicate overforecast; below indicate underforecast
              </p>
            </div>
            <span className="text-xs font-mono text-slate-600 font-semibold">
              R-Fit (1:1 line)
            </span>
          </div>

          <div className="h-[280px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Actual"
                  unit=" MW"
                  stroke="#64748B"
                  fontSize={10}
                  domain={[0, Math.ceil(maxScatterVal / 1000) * 1000]}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Forecast"
                  unit=" MW"
                  stroke="#64748B"
                  fontSize={10}
                  domain={[0, Math.ceil(maxScatterVal / 1000) * 1000]}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    if (!payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-slate-200 rounded p-2 text-xs shadow font-mono space-y-1">
                        <div className="font-bold text-slate-800">{d.time} UTC (SP {d.period})</div>
                        <div>Actual: {d.x.toLocaleString()} MW</div>
                        <div>Forecast: {d.y.toLocaleString()} MW</div>
                        <div className="text-slate-600 font-semibold">
                          Error: {d.error > 0 ? `+${d.error}` : d.error} MW
                        </div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  segment={[
                    { x: 0, y: 0 },
                    { x: maxScatterVal, y: maxScatterVal },
                  ]}
                  stroke="#94A3B8"
                  strokeDasharray="4 4"
                />
                <Scatter data={scatterData} fill="#059669" opacity={0.8} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Chart C: Half-Hourly Signed Error Profile */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Half-Hourly Signed Error Intraday Progression
            </h3>
            <p className="text-[11px] text-slate-500">
              Shows diurnal trends and sudden ramp error occurrences across settlement intervals
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-amber-700">Positive: Overforecast</span>
            <span className="text-rose-700">Negative: Underforecast</span>
          </div>
        </div>

        <div className="h-[260px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={errorTimeSeries} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="time" stroke="#64748B" fontSize={11} interval={3} />
              <YAxis
                stroke="#64748B"
                fontSize={11}
                tickFormatter={(val) => `${val > 0 ? '+' : ''}${val} MW`}
              />
              <Tooltip
                formatter={(val: any) => [`${val > 0 ? '+' : ''}${val} MW`, 'Signed Error']}
                labelFormatter={(lbl) => `Delivery: ${lbl} UTC`}
              />
              <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />
              <Line
                type="monotone"
                dataKey="signedError"
                name="Signed Error (MW)"
                stroke="#047857"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 4: Daily Accuracy Summaries for January 2026 */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              January 2026 Daily Accuracy Benchmark Table
            </h3>
            <p className="text-xs text-slate-500">
              Aggregated daily performance across all 31 days in January 2026 under selected cutoff
            </p>
          </div>
          {aggregateData && (
            <div className="text-xs font-mono text-slate-600">
              Month MAE: <span className="font-bold text-slate-900">{aggregateData.summary.mae?.toLocaleString()} MW</span> ·
              Month RMSE: <span className="font-bold text-slate-900">{aggregateData.summary.rmse?.toLocaleString()} MW</span>
            </div>
          )}
        </div>

        {loadingAggregate ? (
          <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
            Calculating aggregate multi-day statistical benchmarks across January 2026...
          </div>
        ) : aggregateError ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{aggregateError}</span>
          </div>
        ) : aggregateData ? (
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">MAE (MW)</th>
                  <th className="py-2.5 px-3 text-right">RMSE (MW)</th>
                  <th className="py-2.5 px-3 text-right">Mean Bias (MW)</th>
                  <th className="py-2.5 px-3 text-right">MAPE (%)</th>
                  <th className="py-2.5 px-3 text-right">Matched SPs</th>
                  <th className="py-2.5 px-3 text-right">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {aggregateData.dailySummaries.map((day) => {
                  const isCurrent = day.date === seriesData?.date;
                  return (
                    <tr
                      key={day.date}
                      className={`hover:bg-slate-50 transition-colors ${
                        isCurrent ? 'bg-emerald-50/60 font-semibold text-emerald-950' : 'text-slate-700'
                      }`}
                    >
                      <td className="py-2 px-3 whitespace-nowrap">
                        {day.date} {isCurrent && '(Selected)'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {day.mae !== null ? day.mae.toLocaleString() : '—'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {day.rmse !== null ? day.rmse.toLocaleString() : '—'}
                      </td>
                      <td
                        className={`py-2 px-3 text-right tabular-nums ${
                          day.meanBiasError !== null && day.meanBiasError > 0
                            ? 'text-amber-700'
                            : day.meanBiasError !== null && day.meanBiasError < 0
                            ? 'text-rose-700'
                            : ''
                        }`}
                      >
                        {day.meanBiasError !== null
                          ? `${day.meanBiasError > 0 ? '+' : ''}${day.meanBiasError.toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {day.mape !== null ? `${day.mape}%` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{day.matchedPeriods} / 48</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-500">
                        {day.dataCoveragePct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};
