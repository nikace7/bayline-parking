import pytest

pytestmark = pytest.mark.django_db


def test_unknown_api_routes_use_error_envelope(api):
    for url in ("/api/v1/does-not-exist", "/api/v1/members/not-a-uuid"):
        response = api.get(url)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"


def test_health_endpoints_echo_request_id(api):
    live = api.get("/api/v1/health/live", HTTP_X_REQUEST_ID="demo-request-0001")

    assert live.json() == {"data": {"status": "ok"}}
    assert live["X-Request-ID"] == "demo-request-0001"
    assert api.get("/api/v1/health/ready").status_code == 200
