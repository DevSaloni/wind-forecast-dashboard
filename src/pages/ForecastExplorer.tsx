import React, { useState, useMemo } from 'react';
import {
  Download,
  Search,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { AccuracySeriesResponse, ForecastMode, MatchedSettlementRecord } from '../types';

interface ForecastExplorerProps {
  seriesData: AccuracySeriesResponse | null;
  loading: boolean;
  forecastMode: ForecastMode;
}

type SortField =
  | 'settlementPeriod'
  | 'startTime'
  | 'actualGeneration'
  | 'forecastGeneration'
  | 'signedError'
  | 'absoluteError'
  | 'percentageError'
  | 'leadTimeHours';

export const ForecastExplorer: React.FC<ForecastExplorerProps> = ({
  seriesData,
  loading,
  forecastMode,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [errorFilter, setErrorFilter] = useState<'all' | 'over' | 'under'>('all');
  const [sortField, setSortField] = useState<SortField>('settlementPeriod');
  const [sortAsc, setSortAsc] = useState(true);

  const records = seriesData?.records || [];

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const filteredAndSortedRecords = useMemo(() => {
    let result = [...records];

    // Filter by search (matches settlement period or time string)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          r.settlementPeriod.toString().includes(term) ||
          r.startTime.toLowerCase().includes(term)
      );
    }

    // Filter by error direction
    if (errorFilter === 'over') {
      result = result.filter((r) => r.signedError !== null && r.signedError > 0.1);
    } else if (errorFilter === 'under') {
      result = result.filter((r) => r.signedError !== null && r.signedError < -0.1);
    }

    // Sort
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (valA === null || valA === undefined) return sortAsc ? 1 : -1;
      if (valB === null || valB === undefined) return sortAsc ? -1 : 1;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    return result;
  }, [records, searchTerm, errorFilter, sortField, sortAsc]);

  const exportCsv = () => {
    if (!filteredAndSortedRecords.length) return;

    const headers = [
      'SettlementPeriod',
      'StartTimeUTC',
      'ActualGeneration_MW',
      'ForecastGeneration_MW',
      'SignedError_MW',
      'AbsoluteError_MW',
      'PercentageError_Pct',
      'ForecastPublishTimeUTC',
      'LeadTimeHours',
      'ForecastMode',
    ];

    const rows = filteredAndSortedRecords.map((r) => [
      r.settlementPeriod,
      r.startTime,
      r.actualGeneration ?? '',
      r.forecastGeneration ?? '',
      r.signedError ?? '',
      r.absoluteError ?? '',
      r.percentageError ?? '',
      r.forecastPublishTime ?? '',
      r.leadTimeHours ?? '',
      forecastMode,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `windwise_forecast_explorer_${seriesData?.date || 'data'}_${forecastMode}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Workspace Header & Provenance Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Half-Hourly Forecast & Actual Settlement Workspace
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Settlement date {seriesData?.date} · Evaluated mode:{' '}
            <span className="font-semibold text-slate-700">
              {forecastMode === 'decision_time'
                ? 'Day-Ahead Auction Cutoff (11:00 UTC D-1)'
                : 'Latest Available Pre-Delivery'}
            </span>
          </p>
        </div>

        <button
          onClick={exportCsv}
          disabled={!filteredAndSortedRecords.length}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer shadow-xs whitespace-nowrap disabled:opacity-50"
        >
          <Download className="w-4 h-4 text-slate-500" />
          <span>Export Cleaned CSV</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 max-w-sm w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by settlement period (1-48) or time..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent w-full focus:outline-none text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium">Filter Direction:</span>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setErrorFilter('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                errorFilter === 'all'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Periods ({records.length})
            </button>
            <button
              onClick={() => setErrorFilter('over')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                errorFilter === 'over'
                  ? 'bg-white text-amber-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Overforecasts
            </button>
            <button
              onClick={() => setErrorFilter('under')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                errorFilter === 'under'
                  ? 'bg-white text-rose-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Underforecasts
            </button>
          </div>
        </div>
      </div>

      {/* Settlement Records Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                <th
                  onClick={() => handleSort('settlementPeriod')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>SP</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('startTime')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Delivery Start (UTC)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('actualGeneration')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Actual (MW)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('forecastGeneration')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Forecast (MW)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('signedError')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Signed Error (MW)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('absoluteError')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Abs Error (MW)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('percentageError')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Abs % Error</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-left whitespace-nowrap">
                  <span>Forecast Published (UTC)</span>
                </th>
                <th
                  onClick={() => handleSort('leadTimeHours')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Lead Time</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="py-3 px-4 bg-slate-50/50" />
                  </tr>
                ))
              ) : filteredAndSortedRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No settlement records found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredAndSortedRecords.map((r) => {
                  const isOver = r.signedError !== null && r.signedError > 0.1;
                  const isUnder = r.signedError !== null && r.signedError < -0.1;

                  return (
                    <tr
                      key={r.settlementPeriod}
                      className="hover:bg-slate-50/80 transition-colors font-mono"
                    >
                      <td className="py-2.5 px-4 font-bold text-slate-900 tabular-nums">
                        {r.settlementPeriod}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                        {r.startTime.replace('T', ' ').substring(0, 16)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-emerald-800 tabular-nums">
                        {r.actualGeneration !== null ? r.actualGeneration.toLocaleString() : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-slate-900 tabular-nums">
                        {r.forecastGeneration !== null ? r.forecastGeneration.toLocaleString() : '—'}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-semibold tabular-nums ${
                          isOver ? 'text-amber-700' : isUnder ? 'text-rose-700' : 'text-slate-600'
                        }`}
                      >
                        {r.signedError !== null
                          ? `${r.signedError > 0 ? '+' : ''}${r.signedError.toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-700 tabular-nums">
                        {r.absoluteError !== null ? r.absoluteError.toLocaleString() : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-600 tabular-nums">
                        {r.percentageError !== null ? `${r.percentageError}%` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-left text-slate-500 whitespace-nowrap text-[11px]">
                        {r.forecastPublishTime
                          ? r.forecastPublishTime.replace('T', ' ').substring(0, 16)
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-600 tabular-nums text-[11px]">
                        {r.leadTimeHours !== null ? `${r.leadTimeHours}h` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
