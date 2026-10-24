import React from 'react';
import { Info } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number | null;
  unit?: string;
  tooltip: string;
  contextText?: string;
  sentiment?: 'neutral' | 'positive' | 'warning' | 'negative';
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  unit,
  tooltip,
  contextText,
  sentiment = 'neutral',
}) => {
  const getSentimentColor = () => {
    switch (sentiment) {
      case 'positive':
        return 'text-emerald-700';
      case 'warning':
        return 'text-amber-700';
      case 'negative':
        return 'text-rose-700';
      default:
        return 'text-slate-900';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
      {/* Title & Info icon with tooltip */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
        <div className="group relative cursor-help">
          <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          <div className="absolute right-0 top-5 z-20 hidden group-hover:block w-64 p-2.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg shadow-md leading-relaxed">
            {tooltip}
          </div>
        </div>
      </div>

      {/* Main KPI numeric value */}
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tabular-nums ${getSentimentColor()}`}>
          {value !== null && value !== undefined ? value : '—'}
        </span>
        {unit && (
          <span className="text-xs font-medium text-slate-500 uppercase">
            {unit}
          </span>
        )}
      </div>

      {/* Contextual footnote */}
      {contextText && (
        <div className="mt-2 text-xs text-slate-500 border-t border-slate-100 pt-2 leading-tight">
          {contextText}
        </div>
      )}
    </div>
  );
};
