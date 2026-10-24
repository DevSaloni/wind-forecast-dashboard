import React from 'react';
import { Calendar, Clock, RefreshCw, Menu } from 'lucide-react';
import { ForecastMode, NavigationPage } from '../types';

interface HeaderProps {
  currentPage: NavigationPage;
  selectedDate: string;
  onDateChange: (date: string) => void;
  forecastMode: ForecastMode;
  onModeChange: (mode: ForecastMode) => void;
  cutoffHour: number;
  onCutoffChange: (hour: number) => void;
  onRefresh: () => void;
  loading: boolean;
  lastRefreshed: Date | null;
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  selectedDate,
  onDateChange,
  forecastMode,
  onModeChange,
  cutoffHour,
  onCutoffChange,
  onRefresh,
  loading,
  lastRefreshed,
  onOpenMobileMenu,
}) => {
  const getPageTitle = () => {
    switch (currentPage) {
      case 'overview':
        return 'Executive Overview';
      case 'explorer':
        return 'Forecast Explorer';
      case 'accuracy':
        return 'Accuracy Analysis';
      case 'methodology':
        return 'Data Quality & Methodology';
    }
  };

  const janDays = Array.from({ length: 31 }, (_, i) => {
    const day = (i + 1).toString().padStart(2, '0');
    return `2026-01-${day}`;
  });

  return (
    <header className="min-h-16 bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
      {/* Zone 1: Mobile hamburger + Breadcrumb and title */}
      <div className="flex items-center gap-2.5 text-sm text-slate-500 whitespace-nowrap">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 -ml-1 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-medium text-slate-400 hidden sm:inline">WindWise</span>
        <span className="text-slate-300 hidden sm:inline">/</span>
        <h1 className="font-semibold text-slate-900 text-sm sm:text-base">{getPageTitle()}</h1>
      </div>

      {/* Zone 2: Decision Controls */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Date Selector */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 sm:px-2.5 py-1 text-xs text-slate-700">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="font-medium text-slate-500 hidden md:inline">Date:</span>
          <select
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-transparent font-mono font-medium text-slate-900 focus:outline-none cursor-pointer"
          >
            {janDays.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Forecast Mode Segmented Control */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            onClick={() => onModeChange('decision_time')}
            className={`px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              forecastMode === 'decision_time'
                ? 'bg-white text-emerald-950 font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Day-Ahead Auction Cutoff (11:00 UTC D-1)"
          >
            Day-Ahead
          </button>
          <button
            onClick={() => onModeChange('latest')}
            className={`px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              forecastMode === 'latest'
                ? 'bg-white text-emerald-950 font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Latest Available Pre-Delivery"
          >
            Latest
          </button>
        </div>

        {/* Cutoff Selector */}
        {forecastMode === 'decision_time' && (
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 sm:px-2.5 py-1 text-xs text-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={cutoffHour}
              onChange={(e) => onCutoffChange(Number(e.target.value))}
              className="bg-transparent font-mono font-medium text-slate-900 focus:outline-none cursor-pointer max-w-[130px] sm:max-w-none truncate"
            >
              <option value={11}>11:00 UTC D-1 (Auction)</option>
              <option value={12}>12:00 UTC D-1 (Midday)</option>
              <option value={17}>17:00 UTC D-1 (17:00 Gate)</option>
              <option value={8}>08:00 UTC D-1 (Morning)</option>
            </select>
          </div>
        )}

        {/* Refresh Action */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap"
          title="Refresh real Elexon data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-700' : 'text-slate-500'}`} />
          <span className="hidden sm:inline">{loading ? 'Loading...' : 'Refresh'}</span>
        </button>
      </div>
    </header>
  );
};
