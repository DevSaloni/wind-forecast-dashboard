"""Quantitative forecast accuracy calculations for WindWise.

Calculates standard energy industry error metrics:
- Mean Absolute Error (MAE) in MW
- Root Mean Squared Error (RMSE) in MW
- Mean Bias Error (MBE = Forecast - Actual) in MW
- Mean Absolute Percentage Error (MAPE) in %, strictly handling non-zero actuals
- Settlement period matching and coverage analysis
- Over/underforecast distribution
"""
import math
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
import numpy as np
from dateutil import parser as dt_parser

from backend.app.schemas.models import (
    AccuracyMetrics,
    MatchedSettlementRecord,
    WindActualRecord,
    WindForecastRecord,
)


def compute_lead_time_hours(start_time_iso: str, publish_time_iso: str) -> Optional[float]:
    """Calculate lead time in hours between publication timestamp and delivery startTime."""
    try:
        start_dt = dt_parser.parse(start_time_iso)
        pub_dt = dt_parser.parse(publish_time_iso)
        diff_seconds = (start_dt - pub_dt).total_seconds()
        return round(diff_seconds / 3600.0, 2)
    except Exception:
        return None


def match_actuals_and_forecasts(
    actuals: List[WindActualRecord],
    forecasts: List[WindForecastRecord],
    expected_start_times: Optional[List[str]] = None,
) -> Tuple[List[MatchedSettlementRecord], AccuracyMetrics]:
    """Join actuals and forecasts on startTime, calculate errors, and compute aggregate metrics.
    
    Preserves provenance and tracks missing periods explicitly.
    """
    actuals_by_start: Dict[str, WindActualRecord] = {a.startTime: a for a in actuals}
    forecasts_by_start: Dict[str, WindForecastRecord] = {f.startTime: f for f in forecasts}

    # Determine universe of settlement periods
    if expected_start_times:
        all_start_times = sorted(set(expected_start_times))
    else:
        all_start_times = sorted(set(actuals_by_start.keys()) | set(forecasts_by_start.keys()))

    matched_records: List[MatchedSettlementRecord] = []
    
    abs_errors: List[float] = []
    signed_errors: List[float] = []
    sq_errors: List[float] = []
    percentage_errors: List[float] = []
    
    matched_count = 0
    missing_forecast_count = 0
    missing_actual_count = 0
    overforecast_count = 0
    underforecast_count = 0
    balanced_count = 0

    for start_ts in all_start_times:
        actual_rec = actuals_by_start.get(start_ts)
        forecast_rec = forecasts_by_start.get(start_ts)

        actual_gen = actual_rec.generation if actual_rec else None
        forecast_gen = forecast_rec.generation if forecast_rec else None
        pub_time = forecast_rec.publishTime if forecast_rec else None
        
        # Determine settlement period number
        if actual_rec:
            period = actual_rec.settlementPeriod
        elif forecast_rec and forecast_rec.settlementPeriod:
            period = forecast_rec.settlementPeriod
        else:
            # Fallback calculate from timestamp
            dt = dt_parser.parse(start_ts)
            period = (dt.hour * 60 + dt.minute) // 30 + 1

        lead_time = compute_lead_time_hours(start_ts, pub_time) if pub_time else None

        if actual_gen is not None and forecast_gen is not None:
            matched_count += 1
            signed_err = forecast_gen - actual_gen
            abs_err = abs(signed_err)
            sq_err = signed_err ** 2
            
            signed_errors.append(signed_err)
            abs_errors.append(abs_err)
            sq_errors.append(sq_err)

            # Strict MAPE calculation: only include strictly positive actual generation
            # to avoid division by zero or explosive percentages at zero wind
            pct_err: Optional[float] = None
            if actual_gen > 0:
                pct_val = (abs_err / actual_gen) * 100.0
                pct_err = round(pct_val, 2)
                percentage_errors.append(pct_val)
            
            # Signed bias categorization (using 0.1 MW tolerance for floating-point balance)
            if signed_err > 0.1:
                overforecast_count += 1
                is_over = True
            elif signed_err < -0.1:
                underforecast_count += 1
                is_over = False
            else:
                balanced_count += 1
                is_over = None

            matched_records.append(
                MatchedSettlementRecord(
                    settlementPeriod=period,
                    startTime=start_ts,
                    actualGeneration=round(actual_gen, 2),
                    forecastGeneration=round(forecast_gen, 2),
                    signedError=round(signed_err, 2),
                    absoluteError=round(abs_err, 2),
                    percentageError=pct_err,
                    forecastPublishTime=pub_time,
                    leadTimeHours=lead_time,
                    isOverforecast=is_over,
                )
            )
        else:
            if forecast_gen is None:
                missing_forecast_count += 1
            if actual_gen is None:
                missing_actual_count += 1

            matched_records.append(
                MatchedSettlementRecord(
                    settlementPeriod=period,
                    startTime=start_ts,
                    actualGeneration=round(actual_gen, 2) if actual_gen is not None else None,
                    forecastGeneration=round(forecast_gen, 2) if forecast_gen is not None else None,
                    signedError=None,
                    absoluteError=None,
                    percentageError=None,
                    forecastPublishTime=pub_time,
                    leadTimeHours=lead_time,
                    isOverforecast=None,
                )
            )

    total_periods = len(all_start_times)
    coverage_pct = round((matched_count / total_periods * 100.0), 1) if total_periods > 0 else 0.0

    # Aggregate metric computations
    mae: Optional[float] = None
    rmse: Optional[float] = None
    mean_bias: Optional[float] = None
    mape: Optional[float] = None
    p10: Optional[float] = None
    p50: Optional[float] = None
    p90: Optional[float] = None

    if matched_count > 0:
        mae = round(float(np.mean(abs_errors)), 2)
        rmse = round(float(math.sqrt(np.mean(sq_errors))), 2)
        mean_bias = round(float(np.mean(signed_errors)), 2)
        
        if percentage_errors:
            mape = round(float(np.mean(percentage_errors)), 2)
        else:
            mape = None

        p10 = round(float(np.percentile(signed_errors, 10)), 2)
        p50 = round(float(np.percentile(signed_errors, 50)), 2)
        p90 = round(float(np.percentile(signed_errors, 90)), 2)

    summary = AccuracyMetrics(
        mae=mae,
        rmse=rmse,
        meanBiasError=mean_bias,
        mape=mape,
        totalPeriods=total_periods,
        matchedPeriods=matched_count,
        missingForecastPeriods=missing_forecast_count,
        missingActualPeriods=missing_actual_count,
        dataCoveragePct=coverage_pct,
        overforecastCount=overforecast_count,
        underforecastCount=underforecast_count,
        balancedCount=balanced_count,
        p10Error=p10,
        p50Error=p50,
        p90Error=p90,
        evaluationPeriod="Evaluation Scope",
        forecastMode="decision_time",
        cutoffRule="Standard Cutoff",
    )

    # Sort records chronologically
    matched_records.sort(key=lambda r: r.startTime)
    return matched_records, summary
