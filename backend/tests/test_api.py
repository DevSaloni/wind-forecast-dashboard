"""FastAPI endpoint contract tests and date validation tests."""
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "WindWise" in data["service"]
    assert "2026-01-01 to 2026-01-31" in data["allowedWindow"]


def test_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "upstreamElexonStatus" in data
    assert "version" in data


def test_methodology_endpoint():
    response = client.get("/api/v1/methodology")
    assert response.status_code == 200
    data = response.json()
    assert "WindWise" in data["productName"]
    assert "11:00 UTC" in data["cutoffRule"]
    assert "MAE" in data["metricDefinitions"]
    assert "RMSE" in data["metricDefinitions"]
    assert "MAPE" in data["metricDefinitions"]
    assert len(data["limitations"]) > 0


def test_invalid_date_validation_outside_january_2026():
    """Verify that dates outside January 2026 are rejected with HTTP 400."""
    # February 2026
    resp1 = client.get("/api/v1/actuals?date=2026-02-01")
    assert resp1.status_code == 400
    assert "January 2026" in resp1.json()["detail"]

    # December 2025
    resp2 = client.get("/api/v1/forecasts?date=2025-12-31")
    assert resp2.status_code == 400
    assert "January 2026" in resp2.json()["detail"]

    # Malformed date string
    resp3 = client.get("/api/v1/actuals?date=not-a-date")
    assert resp3.status_code == 400
    assert "Invalid date format" in resp3.json()["detail"]


def test_date_range_ordering_validation():
    """start_date after end_date should trigger 400 Bad Request."""
    response = client.get("/api/v1/accuracy?start_date=2026-01-20&end_date=2026-01-10")
    assert response.status_code == 400
    assert "cannot be later than" in response.json()["detail"]
