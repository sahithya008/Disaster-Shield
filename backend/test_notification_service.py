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