"""Pydantic schemas and response contracts for WindWise API."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class WindActualRecord(BaseModel):
    dataset: str = "FUELHH"
    startTime: str = Field(..., description="UTC ISO timestamp of the settlement period start")
    settlementDate: str = Field(..., description="Date string YYYY-MM-DD")
    settlementPeriod: int = Field(..., description="Settlement period number (1-48, or up to 50 on clock-change days)")
    fuelType: str = "WIND"
    generation: float = Field(..., description="Actual wind generation in Megawatts (MW)")


class WindForecastRecord(BaseModel):
    dataset: str = "WINDFOR"
    startTime: str = Field(..., description="UTC ISO timestamp for when generation is forecast to occur")
    publishTime: str = Field(..., description="UTC ISO timestamp when this forecast was published by the TSO/forecaster")
    generation: float = Field(..., description="Forecast wind generation in Megawatts (MW)")
    settlementPeriod: Optional[int] = Field(None, description="Inferred or mapped settlement period (1-48)")


class MatchedSettlementRecord(BaseModel):
    settlementPeriod: int
    startTime: str
    actualGeneration: Optional[float] = None
    forecastGeneration: Optional[float] = None
    signedError: Optional[float] = None  # forecast - actual (MW)
    absoluteError: Optional[float] = None  # |forecast - actual| (MW)
    percentageError: Optional[float] = None  # (|forecast - actual| / actual) * 100 if actual > 0
    forecastPublishTime: Optional[str] = None
    leadTimeHours: Optional[float] = None  # Difference between delivery startTime and publishTime
    isOverforecast: Optional[bool] = None  # True if forecast > actual


class AccuracyMetrics(BaseModel):
    mae: Optional[float] = Field(None, description="Mean Absolute Error in MW")
    rmse: Optional[float] = Field(None, description="Root Mean Squared Error in MW")
    meanBiasError: Optional[float] = Field(None, description="Mean Bias Error in MW (forecast - actual)")
    mape: Optional[float] = Field(None, description="Mean Absolute Percentage Error (%), over non-zero actuals only")
    totalPeriods: int = Field(..., description="Total target settlement periods in the evaluation scope")
    matchedPeriods: int = Field(..., description="Settlement periods where both actual and forecast were available")
    missingForecastPeriods: int = Field(0, description="Periods missing forecast values")
    missingActualPeriods: int = Field(0, description="Periods missing actual generation values")
    dataCoveragePct: float = Field(..., description="Percentage of periods with matched actual and forecast (0-100%)")
    overforecastCount: int = Field(0, description="Count of periods where forecast exceeded actual generation")
    underforecastCount: int = Field(0, description="Count of periods where forecast was below actual generation")
    balancedCount: int = Field(0, description="Count of periods where forecast matched actual generation exactly")
    p10Error: Optional[float] = Field(None, description="10th percentile signed error in MW")
    p50Error: Optional[float] = Field(None, description="50th percentile (median) signed error in MW")
    p90Error: Optional[float] = Field(None, description="90th percentile signed error in MW")
    evaluationPeriod: str = Field(..., description="Human-readable description of evaluated period")
    forecastMode: str = Field(..., description="'decision_time' or 'latest'")
    cutoffRule: str = Field(..., description="Explanation of decision cutoff applied")


class DailyAccuracySummary(BaseModel):
    date: str
    mae: Optional[float]
    rmse: Optional[float]
    meanBiasError: Optional[float]
    mape: Optional[float]
    matchedPeriods: int
    dataCoveragePct: float


class AccuracySeriesResponse(BaseModel):
    date: str
    mode: str
    cutoffRule: str
    records: List[MatchedSettlementRecord]
    summary: AccuracyMetrics


class AggregateAccuracyResponse(BaseModel):
    startDate: str
    endDate: str
    mode: str
    cutoffRule: str
    summary: AccuracyMetrics
    dailySummaries: List[DailyAccuracySummary]


class HealthResponse(BaseModel):
    status: str
    timestamp: str
    upstreamElexonStatus: str
    elexonBaseUrl: str
    version: str


class MethodologyResponse(BaseModel):
    productName: str
    targetCustomer: str
    marketContext: str
    cutoffRule: str
    whyCutoffMatters: str
    metricDefinitions: Dict[str, str]
    dataCleansingSteps: List[str]
    limitations: List[str]
