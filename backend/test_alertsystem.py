import pytest
import requests
from unittest.mock import patch
from backend.alertsystem import fetch_gis_alert_data
from backend import alertsystem

@patch('requests.get')
def test_gis_api_down_returns_503(mock_get):
    """Test Case 1: External API Offline (503 Service Unavailable)"""
    mock_get.side_effect = requests.exceptions.ConnectionError()
    response, status_code = fetch_gis_alert_data()
    assert status_code == 503

@patch('requests.get')
def test_gis_api_timeout_returns_504(mock_get):
    """Test Case 2: External API Timeout (504 Gateway Timeout)"""
    mock_get.side_effect = requests.exceptions.Timeout()
    response, status_code = fetch_gis_alert_data()
    assert status_code == 504


@pytest.mark.parametrize("demo_city", ["DemoLocation", "Demo Location", "demo-location"])
def test_demo_location_weather_returns_synthetic_report(monkeypatch, demo_city):
    sent_reports = []
    monkeypatch.setattr(
        alertsystem,
        "get_account",
        lambda user_id: {"id": user_id, "email": "demo@example.com"},
    )
    monkeypatch.setattr(
        alertsystem,
        "send_search_analysis_to_subscriber",
        lambda email, report: sent_reports.append((email, report)),
    )
    monkeypatch.setattr(
        alertsystem.requests,
        "get",
        lambda *args, **kwargs: pytest.fail("Demo report should not call weather APIs"),
    )

    client = alertsystem.app.test_client()
    with client.session_transaction() as session:
        session["user_id"] = 123

    response = client.post(
        "/weather",
        json={"city": demo_city, "state": "Telangana", "country": "India"},
    )

    report = response.get_json()
    assert response.status_code == 200
    assert report["success"] is True
    assert report["demo_mode"] is True
    assert report["location"]["latitude"] == pytest.approx(17.67)
    assert report["risks"]["flood_risk"] >= 0.6
    assert len(report["forecast"]) == 7
    assert sent_reports[0][0] == "demo@example.com"


def test_analysis_alert_sound_requires_login_and_serves_audio():
    client = alertsystem.app.test_client()
    assert client.get("/api/analysis-alert-sound").status_code == 401

    with client.session_transaction() as session:
        session["user_id"] = 123

    response = client.get("/api/analysis-alert-sound")

    assert response.status_code == 200
    assert response.mimetype == "audio/mpeg"
    assert response.data
