import json

import pytest

from backend import notification_service


@pytest.fixture
def notification_db(tmp_path, monkeypatch):
    monkeypatch.setattr(notification_service, "DB_PATH", tmp_path / "notifications.sqlite3")
    notification_service.initialize_database()
    return notification_service


def add_subscription(service, email, district, channels, telegram_chat_id=""):
    with service.db_connect() as db:
        db.execute(
            """
            INSERT INTO subscriptions(
                email, telegram_chat_id, district, state, categories_json,
                channels_json, consent_at, active, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (email, telegram_chat_id, district, "Maharashtra", json.dumps(["all"]),
             json.dumps(channels), "consented", "created"),
        )


def test_search_analysis_sends_to_telegram_only_when_opted_in(notification_db, monkeypatch):
    add_subscription(notification_db, "user@example.com", "Pune", ["telegram"], "chat-123")
    sent = []
    monkeypatch.setattr(notification_db, "_telegram_send", lambda chat_id, body: sent.append((chat_id, body)))
    monkeypatch.setattr(notification_db, "_send_analysis_email", lambda *args: pytest.fail("Email was not opted in"))

    result = notification_db.send_search_analysis_to_subscriber(
        "user@example.com", {"location": {"city": "Pune", "state": "Maharashtra"}}
    )

    assert result is True
    assert len(sent) == 1
    assert sent[0][0] == "chat-123"
    with notification_db.db_connect() as db:
        status = db.execute("SELECT status FROM report_deliveries").fetchone()[0]
    assert status == "sent"


def test_search_analysis_attempts_telegram_when_email_fails(notification_db, monkeypatch):
    add_subscription(
        notification_db, "user@example.com", "Pune", ["email", "telegram"], "chat-123"
    )
    add_subscription(
        notification_db, "user@example.com", "Mumbai", ["telegram"], "chat-123"
    )
    sent = []

    def fail_email(*args):
        raise RuntimeError("SMTP unavailable")

    monkeypatch.setattr(notification_db, "_send_analysis_email", fail_email)
    monkeypatch.setattr(notification_db, "_telegram_send", lambda chat_id, body: sent.append(chat_id))

    result = notification_db.send_search_analysis_to_subscriber(
        "user@example.com", {"location": {"city": "Pune", "state": "Maharashtra"}}
    )

    assert result is True
    assert sent == ["chat-123"]
    with notification_db.db_connect() as db:
        row = db.execute("SELECT status, detail FROM report_deliveries").fetchone()
    assert row["status"] == "partial"
    assert row["detail"].startswith("email: SMTP unavailable")


def test_demo_search_analysis_sends_one_normal_telegram_message(notification_db, monkeypatch):
    add_subscription(notification_db, "demo@example.com", "DemoLocation", ["telegram"], "chat-demo")
    sent = []
    monkeypatch.setattr(notification_db, "_telegram_send", lambda chat_id, body: sent.append((chat_id, body)))

    result = notification_db.send_search_analysis_to_subscriber(
        "demo@example.com", {"demo_mode": True, "location": {"city": "DemoLocation", "state": "Telangana"}}
    )

    assert result is True
    assert len(sent) == 1
    assert sent[0][0] == "chat-demo"
    assert "DEMO DATA ONLY" in sent[0][1]


def test_demo_location_returns_synthetic_high_flood_risk(notification_db, monkeypatch):
    monkeypatch.setattr(
        notification_db.requests,
        "get",
        lambda *args, **kwargs: pytest.fail("Demo data should not call weather APIs"),
    )

    report = notification_db.fetch_subscription_analysis("DemoLocation", "Telangana")

    assert report["demo_mode"] is True
    assert report["location"]["country"] == "India"
    assert report["risks"]["flood_risk"] >= 0.7
    assert "critical modeled flood risk" in report["forecast_summary"].lower()
    assert any("critical flood risk" in alert.lower() for alert in report["alerts"])


def test_telegram_only_subscription_is_scheduled(notification_db):
    _, is_first_signup = notification_db.create_subscription(
        {
            "email": "demo@example.com",
            "district": "DemoLocation",
            "state": "Telangana",
            "telegram_chat_id": "chat-demo",
            "categories": ["all"],
            "channels": ["telegram"],
            "consent": True,
        }
    )

    with notification_db.db_connect() as db:
        next_report_at = db.execute(
            "SELECT next_report_at FROM subscriptions WHERE email=?",
            ("demo@example.com",),
        ).fetchone()[0]

    assert is_first_signup is True
    assert next_report_at is not None


def test_due_demo_subscription_sends_non_silent_telegram_risk_alert(notification_db, monkeypatch):
    add_subscription(
        notification_db, "demo@example.com", "DemoLocation", ["telegram"], "chat-demo"
    )
    with notification_db.db_connect() as db:
        db.execute(
            "UPDATE subscriptions SET state='Telangana', next_report_at=?",
            ("2000-01-01T00:00:00+00:00",),
        )
    sent = []
    monkeypatch.setattr(
        notification_db,
        "_telegram_send",
        lambda chat_id, body: sent.append((chat_id, body)),
    )
    monkeypatch.setattr(
        notification_db,
        "_send_analysis_email",
        lambda *args: pytest.fail("Email was not selected"),
    )
    notification_db.deliver_scheduled_analysis_reports()

    assert len(sent) == 1
    assert sent[0][0] == "chat-demo"
    assert "DEMO ONLY - HIGH FLOOD RISK" in sent[0][1]
    with notification_db.db_connect() as db:
        row = db.execute(
            "SELECT status FROM report_deliveries WHERE kind='subscription'"
        ).fetchone()
        next_report = db.execute(
            "SELECT next_report_at FROM subscriptions"
        ).fetchone()[0]
    assert row["status"] == "sent"
    assert next_report > "2000-01-01T00:00:00+00:00"


def test_due_telegram_report_is_skipped_below_moderate_risk(notification_db, monkeypatch):
    add_subscription(
        notification_db, "demo@example.com", "Pune", ["telegram"], "chat-demo"
    )
    with notification_db.db_connect() as db:
        db.execute(
            "UPDATE subscriptions SET next_report_at=?",
            ("2000-01-01T00:00:00+00:00",),
        )
    monkeypatch.setattr(
        notification_db,
        "fetch_subscription_analysis",
        lambda *args: {"risks": {"flood_risk": 0.2}},
    )
    monkeypatch.setattr(
        notification_db,
        "_telegram_send",
        lambda *args: pytest.fail("Low-risk Telegram alert should be skipped"),
    )

    notification_db.deliver_scheduled_analysis_reports()

    with notification_db.db_connect() as db:
        status = db.execute(
            "SELECT status FROM report_deliveries WHERE kind='subscription'"
        ).fetchone()[0]
    assert status == "skipped"


def test_telegram_analysis_uses_normal_notification_sound(notification_db, monkeypatch):
    captured = {}

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"ok": True}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "demo-token")
    monkeypatch.setattr(
        notification_db.requests,
        "post",
        lambda url, **kwargs: (captured.update(kwargs) or Response()),
    )

    notification_db._telegram_send("chat-demo", "Demo risk alert")

    assert captured["json"]["disable_notification"] is False




