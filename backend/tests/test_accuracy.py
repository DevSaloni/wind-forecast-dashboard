"""Unit tests for accuracy metrics calculation and edge case handling."""
import pytest
from backend.app.schemas.models import WindActualRecord, WindForecastRecord
from backend.app.services.accuracy_service import (
    match_actuals_and_forecasts,
    compute_lead_time_hours,
)


def test_lead_time_hours_calculation():
    start = "2026-01-15T12:00:00Z"
    publish = "2026-01-14T11:00:00Z"
    lead = compute_lead_time_hours(start, publish)
    assert lead == 25.0  # 25 hours from 11:00 D-1 to 12:00 D


def test_standard_accuracy_metrics():
    """Verify exact analytical values for MAE, RMSE, Bias, and MAPE."""
    # Actuals: 1000, 2000, 3000 MW
    # Forecasts: 1100, 1900, 3300 MW
    # Errors (Forecast - Actual): +100, -100, +300 MW
    # Absolute errors: 100, 100, 300 -> MAE = (100 + 100 + 300)/3 = 500/3 = 166.67 MW
    # Squared errors: 10000, 10000, 90000 -> Mean = 110000/3 = 36666.67 -> RMSE = sqrt(36666.67) = 191.49 MW
    # Mean Bias Error: (+100 - 100 + 300)/3 = 300/3 = +100.0 MW
    # Percentage errors:
    # 100/1000 = 10%, 100/2000 = 5%, 300/3000 = 10% -> MAPE = (10 + 5 + 10)/3 = 8.33%
    actuals = [
        WindActualRecord(startTime="2026-01-15T00:00:00Z", settlementDate="2026-01-15", settlementPeriod=1, generation=1000.0),
        WindActualRecord(startTime="2026-01-15T00:30:00Z", settlementDate="2026-01-15", settlementPeriod=2, generation=2000.0),
        WindActualRecord(startTime="2026-01-15T01:00:00Z", settlementDate="2026-01-15", settlementPeriod=3, generation=3000.0),
    ]
    forecasts = [
        WindForecastRecord(startTime="2026-01-15T00:00:00Z", publishTime="2026-01-14T11:00:00Z", generation=1100.0),
        WindForecastRecord(startTime="2026-01-15T00:30:00Z", publishTime="2026-01-14T11:00:00Z", generation=1900.0),
        WindForecastRecord(startTime="2026-01-15T01:00:00Z", publishTime="2026-01-14T11:00:00Z", generation=3300.0),
    ]

    records, summary = match_actuals_and_forecasts(actuals, forecasts)

    assert len(records) == 3
    assert summary.matchedPeriods == 3
    assert summary.missingActualPeriods == 0
    assert summary.missingForecastPeriods == 0
    assert summary.dataCoveragePct == 100.0

    assert summary.mae == pytest.approx(166.67, 0.05)
    assert summary.rmse == pytest.approx(191.49, 0.05)
    assert summary.meanBiasError == pytest.approx(100.0, 0.05)
    assert summary.mape == pytest.approx(8.33, 0.05)
    assert summary.overforecastCount == 2
    assert summary.underforecastCount == 1


def test_zero_actual_handling_never_divides_by_zero():
    """Ensure zero actual generation does not cause division by zero in MAPE."""
    actuals = [
        WindActualRecord(startTime="2026-01-15T00:00:00Z", settlementDate="2026-01-15", settlementPeriod=1, generation=0.0),
        WindActualRecord(startTime="2026-01-15T00:30:00Z", settlementDate="2026-01-15", settlementPeriod=2, generation=100.0),
    ]
    forecasts = [
        WindForecastRecord(startTime="2026-01-15T00:00:00Z", publishTime="2026-01-14T11:00:00Z", generation=50.0),
        WindForecastRecord(startTime="2026-01-15T00:30:00Z", publishTime="2026-01-14T11:00:00Z", generation=120.0),
    ]

    records, summary = match_actuals_and_forecasts(actuals, forecasts)
    
    # First record percentage error should be None (excluded)
    assert records[0].percentageError is None
    # Second record percentage error: |120 - 100| / 100 = 20%
    assert records[1].percentageError == 20.0
    # Aggregate MAPE should be 20.0% (over only non-zero actuals)
    assert summary.mape == 20.0

    # Test all-zero actuals
    zero_actuals = [
        WindActualRecord(startTime="2026-01-15T00:00:00Z", settlementDate="2026-01-15", settlementPeriod=1, generation=0.0)
    ]
    zero_forecasts = [
        WindForecastRecord(startTime="2026-01-15T00:00:00Z", publishTime="2026-01-14T11:00:00Z", generation=50.0)
    ]
    _, zero_summary = match_actuals_and_forecasts(zero_actuals, zero_forecasts)
    assert zero_summary.mape is None  # Handled safely as None rather than NaN or 0.0


def test_missing_forecast_records():
    """Verify that periods with actuals but missing forecasts are reported properly."""
    actuals = [
        WindActualRecord(startTime="2026-01-15T00:00:00Z", settlementDate="2026-01-15", settlementPeriod=1, generation=1000.0),
        WindActualRecord(startTime="2026-01-15T00:30:00Z", settlementDate="2026-01-15", settlementPeriod=2, generation=1200.0),
    ]
    # Forecast only provided for period 1
    forecasts = [
        WindForecastRecord(startTime="2026-01-15T00:00:00Z", publishTime="2026-01-14T11:00:00Z", generation=1050.0),
    ]

    records, summary = match_actuals_and_forecasts(actuals, forecasts)
    assert summary.matchedPeriods == 1
    assert summary.missingForecastPeriods == 1
    assert summary.missingActualPeriods == 0
    assert summary.dataCoveragePct == 50.0
    assert records[1].forecastGeneration is None
    assert records[1].signedError is None


def test_missing_actual_records():
    """Verify that periods with forecasts but missing actuals are reported properly."""
    actuals = [
        WindActualRecord(startTime="2026-01-15T00:00:00Z", settlementDate="2026-01-15", settlementPeriod=1, generation=1000.0),
    ]
    forecasts = [
        WindForecastRecord(startTime="2026-01-15T00:00:00Z", publishTime="2026-01-14T11:00:00Z", generation=1050.0),
        WindForecastRecord(startTime="2026-01-15T00:30:00Z", publishTime="2026-01-14T11:00:00Z", generation=1200.0),
    ]

    records, summary = match_actuals_and_forecasts(actuals, forecasts)
    assert summary.matchedPeriods == 1
    assert summary.missingForecastPeriods == 0
    assert summary.missingActualPeriods == 1
    assert summary.dataCoveragePct == 50.0
    assert records[1].actualGeneration is None


def test_empty_dataset_handling():
    """Verify handling when both actuals and forecasts are empty."""
    records, summary = match_actuals_and_forecasts([], [])
    assert records == []
    assert summary.matchedPeriods == 0
    assert summary.totalPeriods == 0
    assert summary.dataCoveragePct == 0.0
    assert summary.mae is None
    assert summary.rmse is None
    assert summary.meanBiasError is None
    assert summary.mape is None
