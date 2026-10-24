"""API v1 route handlers for WindWise."""
import logging
from datetime import datetime, date, timezone, timedelta
from typing import List, Optional, Literal
from fastapi import APIRouter, HTTPException, Query
from dateutil import parser as dt_parser

from backend.app.core.config import settings
from backend.app.clients.elexon_client import elexon_client, ElexonAPIError
from backend.app.schemas.models import (
    AccuracyMetrics,
    AccuracySeriesResponse,
    AggregateAccuracyResponse,
    DailyAccuracySummary,
    HealthResponse,
    MatchedSettlementRecord,
    MethodologyResponse,
    WindActualRecord,
    WindForecastRecord,
)
from backend.app.services.forecast_service import (
    select_day_ahead_forecasts,
    select_latest_available_forecasts,
)
from backend.app.services.accuracy_service import match_actuals_and_forecasts

logger = logging.getLogger("windwise.api")
router = APIRouter()


def validate_january_2026_date(date_str: str) -> date:
    """Validate that the given date falls strictly within the January 2026 analysis window."""
    try:
        parsed_dt = dt_parser.parse(date_str).date()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format '{date_str}'. Expected ISO YYYY-MM-DD.",
        )

    if parsed_dt.year != 2026 or parsed_dt.month != 1:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Date {date_str} is outside the allowed January 2026 evaluation window. "
                "Per assignment requirements, analysis is restricted to 2026-01-01 through 2026-01-31."
            ),
        )
    return parsed_dt


def generate_expected_settlement_periods(target_date: date) -> List[str]:
    """Generate all 48 expected half-hourly settlement period UTC start timestamps for a date."""
    base_dt = datetime(target_date.year, target_date.month, target_date.day, 0, 0, tzinfo=timezone.utc)
    return [(base_dt + timedelta(minutes=30 * i)).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(48)]


@router.get("/health", response_model=HealthResponse)
async def get_health():
    """Return backend service health and upstream Elexon data source status."""
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    upstream_status = "nominal"
    try:
        # Ping FUELHH with a small 30-minute test slice
        test_data = await elexon_client.fetch_actual_wind("2026-01-15", "2026-01-15")
        if not test_data:
            upstream_status = "degraded_empty"
    except Exception as exc:
        logger.warning(f"Upstream Elexon health ping failed: {exc}")
        upstream_status = f"unreachable: {str(exc)}"

    return HealthResponse(
        status="healthy",
        timestamp=now_iso,
        upstreamElexonStatus=upstream_status,
        elexonBaseUrl=settings.ELEXON_API_BASE_URL,
        version=settings.VERSION,
    )


@router.get("/actuals", response_model=List[WindActualRecord])
async def get_actuals(
    date: str = Query(..., description="Delivery date in YYYY-MM-DD format (January 2026)")
):
    """Return actual national UK wind-generation records (FUELHH dataset, fuelType=WIND) for a date."""
    parsed_date = validate_january_2026_date(date)
    date_str = parsed_date.strftime("%Y-%m-%d")

    try:
        records = await elexon_client.fetch_actual_wind(date_str, date_str)
        return [WindActualRecord(**r) for r in records]
    except ElexonAPIError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to retrieve actuals from Elexon BMRS API: {exc.message}",
        )


@router.get("/forecasts", response_model=List[WindForecastRecord])
async def get_forecasts(
    date: str = Query(..., description="Delivery date in YYYY-MM-DD format (January 2026)"),
    mode: Literal["decision_time", "latest"] = Query("decision_time", description="Forecast mode: 'decision_time' or 'latest'"),
    cutoff_hour: int = Query(11, ge=0, le=23, description="Decision cutoff hour in UTC on day D-1"),
    cutoff_minute: int = Query(0, ge=0, le=59, description="Decision cutoff minute"),
):
    """Return wind forecasts for a delivery date selected by either:
    1. 'decision_time': Forecast available at the day-ahead auction cutoff (default 11:00 UTC on D-1).
    2. 'latest': The latest forecast revision published prior to each delivery period start time.
    """
    parsed_date = validate_january_2026_date(date)
    date_str = parsed_date.strftime("%Y-%m-%d")

    try:
        raw_forecasts = await elexon_client.fetch_wind_forecasts(date_str, date_str)
    except ElexonAPIError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to retrieve forecasts from Elexon BMRS API: {exc.message}",
        )

    if mode == "decision_time":
        selected, _ = select_day_ahead_forecasts(
            raw_forecasts, parsed_date, cutoff_hour=cutoff_hour, cutoff_minute=cutoff_minute
        )
    else:
        selected, _ = select_latest_available_forecasts(raw_forecasts, parsed_date)

    return selected


@router.get("/accuracy/series", response_model=AccuracySeriesResponse)
async def get_accuracy_series(
    date: str = Query(..., description="Target delivery date in January 2026"),
    mode: Literal["decision_time", "latest"] = Query("decision_time"),
    cutoff_hour: int = Query(11, ge=0, le=23),
    cutoff_minute: int = Query(0, ge=0, le=59),
):
    """Return half-hourly matched time series records and single-day accuracy metrics."""
    parsed_date = validate_january_2026_date(date)
    date_str = parsed_date.strftime("%Y-%m-%d")

    try:
        raw_actuals = await elexon_client.fetch_actual_wind(date_str, date_str)
        raw_forecasts = await elexon_client.fetch_wind_forecasts(date_str, date_str)
    except ElexonAPIError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream Elexon API error: {exc.message}",
        )

    actual_models = [WindActualRecord(**r) for r in raw_actuals]

    if mode == "decision_time":
        forecast_models, cutoff_rule = select_day_ahead_forecasts(
            raw_forecasts, parsed_date, cutoff_hour=cutoff_hour, cutoff_minute=cutoff_minute
        )
    else:
        forecast_models, cutoff_rule = select_latest_available_forecasts(raw_forecasts, parsed_date)

    expected_times = generate_expected_settlement_periods(parsed_date)
    records, summary = match_actuals_and_forecasts(
        actual_models, forecast_models, expected_start_times=expected_times
    )

    summary.evaluationPeriod = f"Day {date_str} (48 Settlement Periods)"
    summary.forecastMode = mode
    summary.cutoffRule = cutoff_rule

    return AccuracySeriesResponse(
        date=date_str,
        mode=mode,
        cutoffRule=cutoff_rule,
        records=records,
        summary=summary,
    )


@router.get("/accuracy", response_model=AggregateAccuracyResponse)
async def get_accuracy_aggregate(
    start_date: str = Query("2026-01-01", description="Start date in January 2026"),
    end_date: str = Query("2026-01-31", description="End date in January 2026"),
    mode: Literal["decision_time", "latest"] = Query("decision_time"),
    cutoff_hour: int = Query(11, ge=0, le=23),
    cutoff_minute: int = Query(0, ge=0, le=59),
):
    """Return multi-day aggregate accuracy statistics and daily breakdown for the requested date span."""
    p_start = validate_january_2026_date(start_date)
    p_end = validate_january_2026_date(end_date)

    if p_start > p_end:
        raise HTTPException(
            status_code=400,
            detail=f"start_date ({start_date}) cannot be later than end_date ({end_date}).",
        )

    start_str = p_start.strftime("%Y-%m-%d")
    end_str = p_end.strftime("%Y-%m-%d")

    try:
        raw_actuals = await elexon_client.fetch_actual_wind(start_str, end_str)
        raw_forecasts = await elexon_client.fetch_wind_forecasts(start_str, end_str)
    except ElexonAPIError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream Elexon API error: {exc.message}",
        )

    actual_models = [WindActualRecord(**r) for r in raw_actuals]

    # Select forecasts across days
    selected_forecasts: List[WindForecastRecord] = []
    cutoff_rule_final = ""
    curr = p_start
    all_expected_times: List[str] = []

    while curr <= p_end:
        expected = generate_expected_settlement_periods(curr)
        all_expected_times.extend(expected)

        if mode == "decision_time":
            day_fcasts, rule = select_day_ahead_forecasts(
                raw_forecasts, curr, cutoff_hour=cutoff_hour, cutoff_minute=cutoff_minute
            )
        else:
            day_fcasts, rule = select_latest_available_forecasts(raw_forecasts, curr)
        
        selected_forecasts.extend(day_fcasts)
        cutoff_rule_final = rule
        curr += timedelta(days=1)

    all_records, summary = match_actuals_and_forecasts(
        actual_models, selected_forecasts, expected_start_times=all_expected_times
    )

    summary.evaluationPeriod = f"{start_str} to {end_str}"
    summary.forecastMode = mode
    summary.cutoffRule = cutoff_rule_final

    # Build daily summaries
    daily_summaries: List[DailyAccuracySummary] = []
    curr = p_start
    while curr <= p_end:
        c_str = curr.strftime("%Y-%m-%d")
        day_actuals = [a for a in actual_models if a.startTime.startswith(c_str)]
        day_forecasts = [f for f in selected_forecasts if f.startTime.startswith(c_str)]
        day_expected = generate_expected_settlement_periods(curr)

        _, day_sum = match_actuals_and_forecasts(day_actuals, day_forecasts, expected_start_times=day_expected)
        daily_summaries.append(
            DailyAccuracySummary(
                date=c_str,
                mae=day_sum.mae,
                rmse=day_sum.rmse,
                meanBiasError=day_sum.meanBiasError,
                mape=day_sum.mape,
                matchedPeriods=day_sum.matchedPeriods,
                dataCoveragePct=day_sum.dataCoveragePct,
            )
        )
        curr += timedelta(days=1)

    return AggregateAccuracyResponse(
        startDate=start_str,
        endDate=end_str,
        mode=mode,
        cutoffRule=cutoff_rule_final,
        summary=summary,
        dailySummaries=daily_summaries,
    )


@router.get("/methodology", response_model=MethodologyResponse)
async def get_methodology():
    """Return comprehensive analytical methodology, market rules, formula definitions, and audit notes."""
    return MethodologyResponse(
        productName="WindWise — Renewable Forecast Intelligence",
        targetCustomer="Energy procurement and trading analysts at UK electricity utilities participating in the GB wholesale power market.",
        marketContext=(
            "In Great Britain (GB), wholesale electricity contracts for physical delivery on day D are primarily "
            "traded at the Day-Ahead auction operated by EPEX SPOT and Nord Pool. Gate closure occurs at 11:00 UTC (12:00 CET) "
            "on day D-1. Procurement analysts must commit purchase volumes based solely on weather forecasts available prior "
            "to this 11:00 UTC cutoff."
        ),
        cutoffRule=(
            "Standard GB Day-Ahead Gate Closure: 11:00 UTC on Day D-1. Only forecast runs published on or before "
            "this cutoff are eligible for Day-Ahead Decision evaluation. Revisions published after 11:00 UTC on D-1 "
            "are excluded from decision-time evaluation to eliminate lookahead bias."
        ),
        whyCutoffMatters=(
            "Wind forecasts are continuously updated throughout the day as numerical weather prediction (NWP) models ingest "
            "satellite and radar data. An intraday forecast published at 20:00 UTC on D-1 or at 06:00 UTC on day D may be "
            "substantially more accurate than the forecast available at 11:00 UTC on D-1. Evaluating an analyst's day-ahead "
            "procurement decision against later forecast revisions falsely credits or blames the analyst using data that did "
            "not exist when the purchase order was executed."
        ),
        metricDefinitions={
            "MAE": "Mean Absolute Error in Megawatts (MW): (1/N) * sum(|Forecast - Actual|). Measures the average magnitude of generation forecast error without regard to direction.",
            "RMSE": "Root Mean Squared Error in Megawatts (MW): sqrt((1/N) * sum((Forecast - Actual)^2)). Penalizes large, abrupt forecast swings more heavily than small errors.",
            "Mean Bias Error": "Mean Signed Error in Megawatts (MW): (1/N) * sum(Forecast - Actual). A positive value indicates systematic over-forecasting (predicting more wind than produced), while a negative value indicates systematic under-forecasting.",
            "MAPE": "Mean Absolute Percentage Error (%): (1/M) * sum(|Forecast - Actual| / Actual) * 100%. Calculated strictly over settlement periods where Actual > 0 MW to avoid division by zero or mathematical explosion during calm weather.",
            "Data Coverage": "Percentage of the 48 daily settlement periods where both official Elexon actuals (FUELHH) and forecasts (WINDFOR) are successfully matched.",
            "Signed Error": "Forecast (MW) minus Actual (MW). Positive values represent overforecast (surplus procurement risk); negative values represent underforecast (shortfall procurement risk)."
        },
        dataCleansingSteps=[
            "Direct ingestion from official Elexon BMRS API v1 (open, non-synthetic datasets).",
            "Actuals: filtered exclusively to fuelType == 'WIND' from dataset FUELHH.",
            "Forecasts: ingestion from dataset WINDFOR, extracting generation, startTime, and publishTime.",
            "Timestamp normalization: all half-hourly settlement boundaries normalized to standard ISO 8601 UTC representation.",
            "Settlement Period Alignment: matched by unique startTime (00:00 to 23:30 UTC, 48 periods per day).",
            "Deduplication: duplicate publications for the same delivery interval are resolved by selecting the latest publishTime prior to cutoff.",
            "Null handling: missing periods are preserved as explicit nulls with missing-period tracking rather than assumed to be zero."
        ],
        limitations=[
            "Data scope is strictly restricted to national aggregate UK wind generation actuals and forecasts for January 2026.",
            "Does not include regional transmission constraint zones, offshore vs onshore sub-breakdowns, or individual wind farm BMUs.",
            "Does not include system electricity demand, half-hourly wholesale power prices, or Balancing Mechanism System Buy/Sell Prices (cash-out prices).",
            "Financial procurement costs or imbalance penalties are not simulated because price and demand datasets are outside this assignment's scope."
        ]
    )
