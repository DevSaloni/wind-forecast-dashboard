"""Forecast selection service implementing Day-Ahead Decision Cutoff rules.

Critical Domain Logic:
In wholesale electricity trading, electricity contracts for delivery day D must be bought in the
Day-Ahead auction on day D-1. In the UK market (EPEX SPOT / Nord Pool GB), gate closure occurs at
11:00 UTC (12:00 CET) on day D-1.

Therefore, evaluating forecast accuracy against decisions made at that auction requires filtering
out any forecast revisions published after 11:00 UTC on day D-1. Including later forecasts would
introduce lookahead bias (evaluating a trader using information they could not have possessed).
"""
import logging
from datetime import datetime, date, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from dateutil import parser as dt_parser

from backend.app.schemas.models import WindForecastRecord
from backend.app.clients.elexon_client import timestamp_to_settlement_period

logger = logging.getLogger("windwise.forecast_service")


def compute_day_ahead_cutoff_timestamp(
    delivery_date: date, cutoff_hour: int = 11, cutoff_minute: int = 0
) -> datetime:
    """Compute the UTC cutoff datetime for day-ahead procurement decisions for a delivery date.
    
    Default cutoff is 11:00 UTC on day D-1 (the GB Day-Ahead wholesale power auction gate closure).
    """
    decision_day = delivery_date - timedelta(days=1)
    return datetime(
        year=decision_day.year,
        month=decision_day.month,
        day=decision_day.day,
        hour=cutoff_hour,
        minute=cutoff_minute,
        second=0,
        microsecond=0,
        tzinfo=timezone.utc,
    )


def select_day_ahead_forecasts(
    raw_forecasts: List[Dict[str, Any]],
    delivery_date: date,
    cutoff_hour: int = 11,
    cutoff_minute: int = 0,
) -> tuple[List[WindForecastRecord], str]:
    """Select the day-ahead decision-time forecast for each settlement period on delivery_date.
    
    Rule:
    1. Cutoff = (delivery_date - 1 day) at cutoff_hour:cutoff_minute UTC.
    2. Only consider publications where publishTime <= cutoff.
    3. For each unique startTime on delivery_date, select the forecast with max(publishTime).
    4. Exclude all forecast updates published after the cutoff.
    """
    cutoff_dt = compute_day_ahead_cutoff_timestamp(delivery_date, cutoff_hour, cutoff_minute)
    cutoff_iso = cutoff_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    cutoff_rule_desc = (
        f"Day-Ahead Procurement Cutoff: {cutoff_hour:02d}:{cutoff_minute:02d} UTC on {cutoff_dt.strftime('%Y-%m-%d')} "
        f"(D-1 GB Wholesale Auction Gate Closure). Only forecasts published on or before this cutoff are included."
    )

    delivery_date_str = delivery_date.strftime("%Y-%m-%d")

    # Group eligible forecast candidates by startTime
    candidates_by_start: Dict[str, List[Dict[str, Any]]] = {}

    for item in raw_forecasts:
        start_ts = item.get("startTime", "")
        pub_ts = item.get("publishTime", "")
        if not start_ts or not pub_ts:
            continue

        # Delivery period must fall on delivery_date
        if not start_ts.startswith(delivery_date_str):
            continue

        # Strict cutoff check: MUST be published on or before cutoff
        if pub_ts > cutoff_iso:
            continue

        if start_ts not in candidates_by_start:
            candidates_by_start[start_ts] = []
        candidates_by_start[start_ts].append(item)

    selected: List[WindForecastRecord] = []

    # For each startTime, pick the most recent publication available at decision time
    for start_ts, items in candidates_by_start.items():
        # Sort by publishTime descending to find the latest published before cutoff
        items.sort(key=lambda x: x["publishTime"], reverse=True)
        best = items[0]
        selected.append(
            WindForecastRecord(
                dataset="WINDFOR",
                startTime=start_ts,
                publishTime=best["publishTime"],
                generation=float(best["generation"]),
                settlementPeriod=timestamp_to_settlement_period(start_ts),
            )
        )

    # Sort chronologically by startTime
    selected.sort(key=lambda x: x.startTime)
    return selected, cutoff_rule_desc


def select_latest_available_forecasts(
    raw_forecasts: List[Dict[str, Any]], delivery_date: date
) -> tuple[List[WindForecastRecord], str]:
    """Select the most recently published forecast prior to delivery start time for each period.
    
    Rule:
    For each startTime on delivery_date, select max(publishTime) where publishTime <= startTime.
    """
    delivery_date_str = delivery_date.strftime("%Y-%m-%d")
    cutoff_rule_desc = (
        "Latest Available Forecast: Selected the latest revision published prior to the delivery period "
        "startTime (includes intraday revisions and balancing updates)."
    )

    candidates_by_start: Dict[str, List[Dict[str, Any]]] = {}

    for item in raw_forecasts:
        start_ts = item.get("startTime", "")
        pub_ts = item.get("publishTime", "")
        if not start_ts or not pub_ts:
            continue

        if not start_ts.startswith(delivery_date_str):
            continue

        # Publication must occur on or before the delivery period starts
        if pub_ts > start_ts:
            continue

        if start_ts not in candidates_by_start:
            candidates_by_start[start_ts] = []
        candidates_by_start[start_ts].append(item)

    selected: List[WindForecastRecord] = []

    for start_ts, items in candidates_by_start.items():
        items.sort(key=lambda x: x["publishTime"], reverse=True)
        best = items[0]
        selected.append(
            WindForecastRecord(
                dataset="WINDFOR",
                startTime=start_ts,
                publishTime=best["publishTime"],
                generation=float(best["generation"]),
                settlementPeriod=timestamp_to_settlement_period(start_ts),
            )
        )

    selected.sort(key=lambda x: x.startTime)
    return selected, cutoff_rule_desc
