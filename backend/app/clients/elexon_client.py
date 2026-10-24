"""Dedicated HTTP client for the official Elexon BMRS API (v1).

Retrieves national-level UK wind-generation actuals (FUELHH, fuelType=WIND)
and wind-generation forecasts (WINDFOR).
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
import httpx
from dateutil import parser as dt_parser

from backend.app.core.config import settings

logger = logging.getLogger("windwise.elexon_client")


class ElexonAPIError(Exception):
    """Raised when the Elexon BMRS API fails or returns invalid data."""
    def __init__(self, message: str, status_code: Optional[int] = None, details: Optional[Any] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details


class SimpleTTLCache:
    """Lightweight in-memory cache with time-to-live expiration."""
    def __init__(self, ttl_seconds: int = 3600):
        self._cache: Dict[str, tuple[datetime, Any]] = {}
        self._ttl = timedelta(seconds=ttl_seconds)

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            created_at, val = self._cache[key]
            if datetime.now(timezone.utc) - created_at < self._ttl:
                return val
            del self._cache[key]
        return None

    def set(self, key: str, val: Any) -> None:
        self._cache[key] = (datetime.now(timezone.utc), val)

    def clear(self) -> None:
        self._cache.clear()


cache = SimpleTTLCache(ttl_seconds=settings.CACHE_TTL_SECONDS)


def normalize_iso_utc(ts_str: str) -> str:
    """Parse any datetime string and return standardized ISO 8601 UTC format."""
    dt = dt_parser.parse(ts_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def timestamp_to_settlement_period(ts_str: str) -> int:
    """Calculate settlement period (1-48) from a UTC startTime string."""
    dt = dt_parser.parse(ts_str)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc)
    return (dt.hour * 60 + dt.minute) // 30 + 1


class ElexonClient:
    def __init__(self, base_url: Optional[str] = None, timeout: float = settings.REQUEST_TIMEOUT_SECONDS):
        self.base_url = (base_url or settings.ELEXON_API_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.max_retries = settings.MAX_RETRIES

    async def _fetch_with_retries(self, endpoint: str, params: Dict[str, str]) -> Dict[str, Any]:
        """Perform GET request with exponential backoff retries and bounded timeout."""
        url = f"{self.base_url}{endpoint}"
        last_error = None
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for attempt in range(1, self.max_retries + 1):
                try:
                    logger.debug(f"Calling Elexon API {url} with params {params} (attempt {attempt})")
                    response = await client.get(url, params=params)
                    
                    if response.status_code == 200:
                        return response.json()
                    
                    if response.status_code in (429, 502, 503, 504):
                        # Transient server or rate limit error
                        wait_seconds = 1.0 * (2 ** (attempt - 1))
                        logger.warning(
                            f"Elexon API returned status {response.status_code}. Retrying in {wait_seconds}s..."
                        )
                        await asyncio.sleep(wait_seconds)
                        continue
                    
                    # Non-retryable error
                    raise ElexonAPIError(
                        f"Elexon API returned HTTP {response.status_code}: {response.text[:200]}",
                        status_code=response.status_code,
                    )
                except (httpx.RequestError, httpx.TimeoutException) as exc:
                    last_error = exc
                    wait_seconds = 1.0 * (2 ** (attempt - 1))
                    logger.warning(f"Elexon API network exception: {exc}. Retrying in {wait_seconds}s...")
                    await asyncio.sleep(wait_seconds)

        raise ElexonAPIError(
            f"Failed to fetch data from Elexon API after {self.max_retries} attempts: {last_error}"
        )

    async def _fetch_actual_slice(self, slice_start: str, slice_end: str) -> List[Dict[str, Any]]:
        publish_from = f"{slice_start}T00:00:00Z"
        end_dt = dt_parser.parse(slice_end) + timedelta(days=1)
        publish_to = end_dt.strftime("%Y-%m-%dT04:00:00Z")

        params = {
            "publishDateTimeFrom": publish_from,
            "publishDateTimeTo": publish_to,
        }

        raw_json = await self._fetch_with_retries("/datasets/FUELHH", params=params)
        raw_items = raw_json.get("data", [])

        cleaned_records: List[Dict[str, Any]] = []
        seen_keys = set()

        for item in raw_items:
            fuel = str(item.get("fuelType", "")).upper()
            if fuel != "WIND":
                continue
            
            raw_start_time = item.get("startTime")
            raw_gen = item.get("generation")
            if not raw_start_time or raw_gen is None:
                continue

            try:
                gen_val = float(raw_gen)
            except (ValueError, TypeError):
                continue

            normalized_start = normalize_iso_utc(raw_start_time)
            item_date = normalized_start[:10]
            if item_date < slice_start or item_date > slice_end:
                continue

            if normalized_start in seen_keys:
                continue
            seen_keys.add(normalized_start)

            period = item.get("settlementPeriod")
            if period is None:
                period = timestamp_to_settlement_period(normalized_start)

            cleaned_records.append({
                "dataset": "FUELHH",
                "startTime": normalized_start,
                "settlementDate": item.get("settlementDate", item_date),
                "settlementPeriod": int(period),
                "fuelType": "WIND",
                "generation": gen_val,
            })
        return cleaned_records

    async def fetch_actual_wind(self, start_date_str: str, end_date_str: str) -> List[Dict[str, Any]]:
        """Fetch actual national wind generation from FUELHH dataset for a date range.
        Automatically chunks requests into slices <= 5 days to respect Elexon 7-day API limit.
        """
        cache_key = f"FUELHH_{start_date_str}_{end_date_str}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        start_dt = dt_parser.parse(start_date_str).date()
        end_dt = dt_parser.parse(end_date_str).date()

        all_records: List[Dict[str, Any]] = []
        seen_keys = set()
        curr = start_dt

        while curr <= end_dt:
            chunk_end = min(curr + timedelta(days=4), end_dt)
            chunk_recs = await self._fetch_actual_slice(curr.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d"))
            for r in chunk_recs:
                if r["startTime"] not in seen_keys:
                    seen_keys.add(r["startTime"])
                    all_records.append(r)
            curr = chunk_end + timedelta(days=1)

        all_records.sort(key=lambda r: r["startTime"])
        cache.set(cache_key, all_records)
        return all_records

    async def _fetch_forecast_slice(self, slice_start: str, slice_end: str) -> List[Dict[str, Any]]:
        start_dt = dt_parser.parse(slice_start) - timedelta(days=2)
        end_dt = dt_parser.parse(slice_end) + timedelta(days=1)

        publish_from = start_dt.strftime("%Y-%m-%dT00:00:00Z")
        publish_to = end_dt.strftime("%Y-%m-%dT23:59:59Z")

        params = {
            "publishDateTimeFrom": publish_from,
            "publishDateTimeTo": publish_to,
        }

        raw_json = await self._fetch_with_retries("/datasets/WINDFOR", params=params)
        raw_items = raw_json.get("data", [])

        parsed_records: List[Dict[str, Any]] = []
        seen_pairs = set()

        for item in raw_items:
            raw_start = item.get("startTime")
            raw_pub = item.get("publishTime")
            raw_gen = item.get("generation")

            if not raw_start or not raw_pub or raw_gen is None:
                continue

            try:
                gen_val = float(raw_gen)
            except (ValueError, TypeError):
                continue

            norm_start = normalize_iso_utc(raw_start)
            norm_pub = normalize_iso_utc(raw_pub)
            pair_key = (norm_start, norm_pub)
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)

            parsed_records.append({
                "dataset": "WINDFOR",
                "startTime": norm_start,
                "publishTime": norm_pub,
                "generation": gen_val,
                "settlementPeriod": timestamp_to_settlement_period(norm_start),
            })
        return parsed_records

    async def fetch_wind_forecasts(self, start_date_str: str, end_date_str: str) -> List[Dict[str, Any]]:
        """Fetch wind generation forecasts from WINDFOR dataset.
        Automatically chunks requests into slices <= 3 days to guarantee publication window <= 7 days.
        """
        cache_key = f"WINDFOR_{start_date_str}_{end_date_str}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        start_dt = dt_parser.parse(start_date_str).date()
        end_dt = dt_parser.parse(end_date_str).date()

        all_records: List[Dict[str, Any]] = []
        seen_pairs = set()
        curr = start_dt

        while curr <= end_dt:
            chunk_end = min(curr + timedelta(days=3), end_dt)
            chunk_recs = await self._fetch_forecast_slice(curr.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d"))
            for r in chunk_recs:
                pair = (r["startTime"], r["publishTime"])
                if pair not in seen_pairs:
                    seen_pairs.add(pair)
                    all_records.append(r)
            curr = chunk_end + timedelta(days=1)

        all_records.sort(key=lambda r: (r["startTime"], r["publishTime"]))
        cache.set(cache_key, all_records)
        return all_records


elexon_client = ElexonClient()
