import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Database,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  FileText,
} from 'lucide-react';
import { AccuracySeriesResponse, HealthResponse, MethodologyResponse } from '../types';
import { api } from '../services/api';

interface DataQualityMethodologyProps {
  seriesData: AccuracySeriesResponse | null;
  health: HealthResponse | null;
}

export const DataQualityMethodology: React.FC<DataQualityMethodologyProps> = ({
  seriesData,
  health,
}) => {
  const [methodology, setMethodology] = useState<MethodologyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMethodology() {
      try {
        const res = await api.getMethodology();
        setMethodology(res);
      } catch (e) {
        console.error('Failed to load methodology:', e);
      } finally {
        setLoading(false);
      }
    }
    loadMethodology();
  }, []);

  const summary = seriesData?.summary;

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Overview Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-2">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-800" />
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Data Provenance, Audit Trail & Analytical Methodology
          </h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
          WindWise enforces total analytical transparency. Energy procurement analysts and risk committees
          require verifiable audit trails that distinguish forecasts that were physically available at decision
          time from post-hoc updates.
        </p>
      </div>

      {/* Upstream Data Sources & Live Audit Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Source 1: FUELHH */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-800" />
              <h3 className="text-sm font-bold text-slate-900">
                Elexon BMRS FUELHH (Actual Generation)
              </h3>
            </div>
            <span className="text-[11px] font-mono font-medium text-emerald-700">Official Live Stream</span>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-500">Dataset Identifier:</span>
              <span className="font-mono font-semibold text-slate-800">FUELHH</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Fuel Type Filter:</span>
              <span className="font-mono font-semibold text-emerald-800">fuelType = 'WIND'</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Temporal Resolution:</span>
              <span className="font-mono">Half-hourly settlement period (30 min)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Unit of Measurement:</span>
              <span className="font-mono">Megawatts (MW)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Evaluation Window:</span>
              <span className="font-mono">January 2026 (2026-01-01 to 2026-01-31)</span>
            </div>
          </div>
        </div>

        {/* Source 2: WINDFOR */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-800" />
              <h3 className="text-sm font-bold text-slate-900">
                Elexon BMRS WINDFOR (Wind Forecasts)
              </h3>
            </div>
            <span className="text-[11px] font-mono font-medium text-emerald-700">Official Historical Evolution</span>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-500">Dataset Identifier:</span>
              <span className="font-mono font-semibold text-slate-800">WINDFOR</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Key Timestamps:</span>
              <span className="font-mono">publishTime (availability) &amp; startTime (delivery)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Decision Cutoff Convention:</span>
              <span className="font-mono font-semibold text-slate-900">11:00 UTC on Day D-1</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Market Baseline:</span>
              <span className="font-mono">GB Day-Ahead Wholesale Power Auction</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Filtering Rule:</span>
              <span className="font-mono">max(publishTime) &le; Cutoff Timestamp</span>
            </div>
          </div>
        </div>
      </div>

      {/* Crucial Business Logic Explanation: Day-Ahead Gate Closure */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <Clock className="w-4 h-4 text-emerald-800" />
          <span>Core Domain Principle: Day-Ahead Decision Timing vs. Intraday Lookahead Bias</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700 leading-relaxed">
          <div className="space-y-2">
            <div className="font-semibold text-slate-900">1. Why Publish Time Must Be Enforced</div>
            <p>
              In the UK electricity market (BETTA), wholesale contracts for physical delivery on day D
              are committed at the Day-Ahead auction with gate closure at <strong>11:00 UTC on day D-1</strong>{' '}
              (operated by EPEX SPOT and Nord Pool). Traders must execute volume orders based exclusively
              on the weather forecasts available on or before that deadline.
            </p>
            <p>
              Weather forecasters continuously publish updated model runs (e.g. at 18:00 UTC D-1, 00:00 UTC D-0,
              or 06:00 UTC D-0). These subsequent runs have shorter lead times and usually lower error.
            </p>
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-slate-900">2. Preventing Invalidation of Performance Metrics</div>
            <p>
              If a forecasting tool compares actual generation with the <em>latest</em> forecast published 2 hours
              before delivery to judge a trader's day-ahead position, it introduces <strong>lookahead bias</strong>.
            </p>
            <p>
              WindWise explicitly isolates the forecast run that was present at the auction cutoff, ensuring
              procurement analysts are judged against the actual uncertainty they faced when their purchase
              decision had to be submitted.
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Formula Guide */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-3">
          <Calculator className="w-4 h-4 text-emerald-800" />
          <span>Mathematical Formulations &amp; Interpretation</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-lg space-y-2 text-xs">
            <div className="font-bold text-slate-900">MAE (Mean Absolute Error)</div>
            <div className="font-mono text-emerald-900 bg-white p-2 rounded border border-slate-200 text-[11px]">
              MAE = (1/N) &sum; |F_t - A_t|
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Expressed in MW. Measures average error magnitude. Linear penalty without compounding spikes.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-lg space-y-2 text-xs">
            <div className="font-bold text-slate-900">RMSE (Root Mean Squared Error)</div>
            <div className="font-mono text-emerald-900 bg-white p-2 rounded border border-slate-200 text-[11px]">
              RMSE = &radic;[ (1/N) &sum; (F_t - A_t)&sup2; ]
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Expressed in MW. Squares errors before averaging; heavily penalizes sudden catastrophic ramps.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-lg space-y-2 text-xs">
            <div className="font-bold text-slate-900">Mean Bias Error (Signed)</div>
            <div className="font-mono text-emerald-900 bg-white p-2 rounded border border-slate-200 text-[11px]">
              Bias = (1/N) &sum; (F_t - A_t)
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Expressed in MW. Preserves direction: positive indicates overforecasting, negative indicates underforecasting.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-lg space-y-2 text-xs">
            <div className="font-bold text-slate-900">MAPE (Non-Zero Actuals)</div>
            <div className="font-mono text-emerald-900 bg-white p-2 rounded border border-slate-200 text-[11px]">
              MAPE = (1/M) &sum; |F_t - A_t| / A_t
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Expressed in %. Calculated exclusively where A_t &gt; 0 MW. Avoids division by zero during calm periods.
            </p>
          </div>
        </div>
      </div>

      {/* Scope Boundaries & Transparent Limitations */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span>Scope Boundaries &amp; Methodological Limitations</span>
        </div>

        <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
          <li>
            <strong>Scope restriction:</strong> This intelligence platform operates exclusively on official
            national-level UK wind generation actuals (FUELHH, fuelType = WIND) and wind forecasts (WINDFOR)
            for January 2026 as dictated by the assignment contract.
          </li>
          <li>
            <strong>Exclusion of Demand &amp; Thermal Balancing:</strong> Total electricity demand (ND / INDO),
            nuclear/gas schedules, and interconnector flows are not modeled. Therefore, the app does not fabricate
            total system residual imbalances.
          </li>
          <li>
            <strong>Exclusion of Price &amp; Cost Claims:</strong> Day-ahead wholesale clearing prices and
            Balancing Mechanism System Buy/Sell Prices (cash-out prices) are not part of the provided datasets.
            WindWise quantifies volumetric physical wind uncertainty in Megawatts rather than hallucinating monetary savings.
          </li>
          <li>
            <strong>Zonal transmission constraints:</strong> National wind actuals represent whole-system metering;
            local Scottish export constraint curtailments (BOALFs) are embedded in net generation actuals.
          </li>
        </ul>
      </div>
    </div>
  );
};
