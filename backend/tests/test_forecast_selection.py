"""Unit tests for day-ahead decision cutoff and latest-forecast selection logic."""
from datetime import date
import pytest
from backend.app.services.forecast_service import (
    compute_day_ahead_cutoff_timestamp,
    select_day_ahead_forecasts,
    select_latest_available_forecasts,
)


def test_cutoff_timestamp_computation():
    delivery_date = date(2026, 1, 15)
    # Default cutoff 11:00 UTC on day D-1 (2026-01-14)
    cutoff = compute_day_ahead_cutoff_timestamp(delivery_date, cutoff_hour=11, cutoff_minute=0)
    assert cutoff.year == 2026
    assert cutoff.month == 1
    assert cutoff.day == 14
    assert cutoff.hour == 11
    assert cutoff.minute == 0


def test_forecast_selection_excludes_post_cutoff_revisions():
    """Crucial domain requirement:
    Verify that forecasts published AFTER the day-ahead cutoff (11:00 UTC D-1)
    are strictly excluded, even if they are closer to real-time.
    """
    delivery_date = date(2026, 1, 15)
    # Target delivery startTime: 2026-01-15T14:00:00Z
    # Candidate publications:
    # 1. 2026-01-14T06:00:00Z -> Published well before cutoff, generation = 5000 MW
    # 2. 2026-01-14T10:30:00Z -> Published 30 min before cutoff, generation = 5500 MW (SHOULD BE SELECTED)
    # 3. 2026-01-14T11:00:00Z -> Exactly at cutoff, generation = 5600 MW (ELIGIBLE)
    # 4. 2026-01-14T18:00:00Z -> Published after cutoff, generation = 7000 MW (MUST BE EXCLUDED)
    # 5. 2026-01-15T08:00:00Z -> Published on delivery day, generation = 8000 MW (MUST BE EXCLUDED)
    raw_forecasts = [
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-14T06:00:00Z", "generation": 5000.0},
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-14T10:30:00Z", "generation": 5500.0},
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-14T11:00:00Z", "generation": 5600.0},
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-14T18:00:00Z", "generation": 7000.0},
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-15T08:00:00Z", "generation": 8000.0},
    ]

    selected, rule = select_day_ahead_forecasts(raw_forecasts, delivery_date, cutoff_hour=11, cutoff_minute=0)

    assert len(selected) == 1
    # Must select publication from 11:00:00Z (latest <= cutoff)
    assert selected[0].publishTime == "2026-01-14T11:00:00Z"
    assert selected[0].generation == 5600.0
    assert "11:00 UTC on 2026-01-14" in rule


def test_forecast_selection_with_earlier_cutoff():
    """Verify selection when cutoff is set to an earlier hour (e.g., 09:00 UTC D-1)."""
    delivery_date = date(2026, 1, 15)
    raw_forecasts = [
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-14T06:00:00Z", "generation": 5000.0},
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-14T08:30:00Z", "generation": 5200.0},
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-14T10:30:00Z", "generation": 5500.0},
    ]

    selected, _ = select_day_ahead_forecasts(raw_forecasts, delivery_date, cutoff_hour=9, cutoff_minute=0)

    assert len(selected) == 1
    # 08:30 is before 09:00; 10:30 is after 09:00
    assert selected[0].publishTime == "2026-01-14T08:30:00Z"
    assert selected[0].generation == 5200.0


def test_latest_available_forecast_selection():
    """Verify that latest available forecast mode selects the most recent update prior to delivery."""
    delivery_date = date(2026, 1, 15)
    raw_forecasts = [
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-14T10:30:00Z", "generation": 5500.0},
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-15T12:00:00Z", "generation": 6800.0},
        # A forecast published after startTime (14:30 > 14:00) should be excluded
        {"dataset": "WINDFOR", "startTime": "2026-01-15T14:00:00Z", "publishTime": "2026-01-15T14:30:00Z", "generation": 7200.0},
    ]

    selected, _ = select_latest_available_forecasts(raw_forecasts, delivery_date)

    assert len(selected) == 1
    assert selected[0].publishTime == "2026-01-15T12:00:00Z"
    assert selected[0].generation == 6800.0
