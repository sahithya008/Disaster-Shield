"""IMD-backed alert subscriptions and delivery helpers."""
import json
import os
import re
import smtplib
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

import requests
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
DB_PATH_VALUE = os.getenv("ALERTS_DB_PATH", "").strip()
DB_PATH = Path(DB_PATH_VALUE) if DB_PATH_VALUE else ROOT / "backend" / "notifications.sqlite3"
IMD_ROOT = os.getenv("IMD_API_BASE_URL", "https://api.imd.gov.in/api/v1").rstrip("/")
IMD_TOKEN = os.getenv("IMD_API_KEY", "").strip()
IMD_HEADER = os.getenv("IMD_API_AUTH_HEADER", "Authorization").strip()
IMD_PREFIX = os.getenv("IMD_API_AUTH_PREFIX", "Bearer").strip()

WARNING_NAMES = {
    2: "Heavy Rain", 3: "Heavy Snow", 4: "Thunderstorm and Lightning",
    5: "Hailstorm", 6: "Dust Storm", 7: "Dust Raising Winds",
    8: "Strong Surface Winds", 9: "Heat Wave", 10: "Hot Day",
    11: "Warm Night", 12: "Cold Wave", 13: "Cold Day",
    14: "Ground Frost", 15: "Fog", 16: "Very Heavy Rain",
    17: "Extremely Heavy Rain",
}
NOWCAST_NAMES = {
    2: "Light Rain", 3: "Light Snow", 4: "Light Thunderstorm",
    5: "Slight Dust Storm", 6: "Low Lightning Probability",
    7: "Moderate Rain", 8: "Moderate Snow", 9: "Moderate Thunderstorm",
    10: "Moderate Dust Storm", 11: "Moderate Lightning Probability",
    12: "Heavy Rain", 13: "Heavy Snow", 14: "Severe Thunderstorm",
    15: "Very Severe Thunderstorm", 16: "Other IMD Warning",
    17: "Thunderstorm with Hail", 18: "Severe Dust Storm",
    19: "High Lightning Probability",
}


def db_connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=15)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with db_connect() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id),
                email TEXT NOT NULL,
                telegram_chat_id TEXT,
                district TEXT NOT NULL,
                state TEXT NOT NULL,
                categories_json TEXT NOT NULL,
                channels_json TEXT NOT NULL,
                consent_at TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                next_report_at TEXT,
                last_report_at TEXT,
                report_attempts INTEGER NOT NULL DEFAULT 0,
                UNIQUE(email, district, state)
            );
            CREATE TABLE IF NOT EXISTS official_alerts (
                event_key TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                district TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                severity TEXT NOT NULL DEFAULT 'unknown',
                issue_date TEXT NOT NULL DEFAULT '',
                valid_until TEXT NOT NULL DEFAULT '',
                source_url TEXT NOT NULL,
                observed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS deliveries (
                event_key TEXT NOT NULL,
                subscription_id INTEGER NOT NULL,
                channel TEXT NOT NULL,
                status TEXT NOT NULL,
                attempted_at TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                attempts INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY(event_key, subscription_id, channel)
            );
            CREATE TABLE IF NOT EXISTS service_state (
                name TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS report_deliveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                location TEXT NOT NULL,
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                attempted_at TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT ''
            );
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(subscriptions)").fetchall()}
        if "phone" in columns and "telegram_chat_id" not in columns:
            db.execute("ALTER TABLE subscriptions RENAME COLUMN phone TO telegram_chat_id")
        columns = {row["name"] for row in db.execute("PRAGMA table_info(subscriptions)").fetchall()}
        needs_account_migration = "user_id" not in columns
        for name, definition in (
            ("user_id", "INTEGER REFERENCES users(id)"),
            ("next_report_at", "TEXT"),
            ("last_report_at", "TEXT"),
            ("report_attempts", "INTEGER NOT NULL DEFAULT 0"),
        ):
            if name not in columns:
                db.execute(f"ALTER TABLE subscriptions ADD COLUMN {name} {definition}")
        if needs_account_migration:
            # Require legacy email-only subscriptions to be claimed from a signed-in account.
            db.execute("UPDATE subscriptions SET active=0 WHERE user_id IS NULL")
        now = datetime.now(timezone.utc).isoformat()
        db.execute("""
            UPDATE subscriptions SET next_report_at=?
            WHERE active=1 AND next_report_at IS NULL AND report_attempts<5
              AND channels_json LIKE '%"email"%'
        """, (now,))


def create_account(email, password):
    email = str(email or "").strip().lower()
    password = str(password or "")
    if len(email) > 254:
        raise ValueError("Email address must be 254 characters or fewer.")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Enter a valid email address.")
    if len(password) < 10:
        raise ValueError("Use a password with at least 10 characters.")
    if len(password) > 128:
        raise ValueError("Password must be 128 characters or fewer.")
    now = datetime.now(timezone.utc).isoformat()
    password_hash = generate_password_hash(password, method="scrypt")
    try:
        with db_connect() as db:
            cursor = db.execute("INSERT INTO users(email, password_hash, created_at) VALUES (?, ?, ?)",
                                (email, password_hash, now))
            return {"id": cursor.lastrowid, "email": email}
    except sqlite3.IntegrityError as error:
        if "users.email" in str(error).lower() or "unique" in str(error).lower():
            raise ValueError("An account with this email already exists. Log in instead.")
        raise


def authenticate_account(email, password):
    email = str(email or "").strip().lower()
    password = str(password or "")
    if len(password) > 128:
        return None
    with db_connect() as db:
        row = db.execute("SELECT id, email, password_hash FROM users WHERE email=?", (email,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return None
    return {"id": row["id"], "email": row["email"]}


def get_account(user_id):
    with db_connect() as db:
        row = db.execute("SELECT id, email FROM users WHERE id=?", (user_id,)).fetchone()
    return dict(row) if row else None


def _norm(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _first(record, *keys):
    lowered = {str(key).lower(): value for key, value in record.items()}
    for key in keys:
        value = lowered.get(key.lower())
        if value not in (None, ""):
            return value
    return ""


def _records(payload):
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("data", "result", "results", "districtwarning", "districtnowcast"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        if any(key in payload for key in ("District", "district", "Station", "station")):
            return [payload]
    return []


def _imd_headers():
    headers = {"Accept": "application/json", "User-Agent": "DisasterShield/1.0"}
    if IMD_TOKEN:
        value = f"{IMD_PREFIX} {IMD_TOKEN}".strip() if IMD_PREFIX else IMD_TOKEN
        headers[IMD_HEADER or "Authorization"] = value
    return headers


def fetch_imd_endpoint(name):
    response = requests.get(f"{IMD_ROOT}/{name}", headers=_imd_headers(), timeout=20)
    if response.status_code == 401:
        raise RuntimeError("IMD rejected the configured credential (HTTP 401). Check IMD_API_KEY and auth header settings.")
    response.raise_for_status()
    return response.json()


def _category_for_title(title):
    value = title.lower()
    if any(word in value for word in ("rain", "flood")):
        return "rain"
    if any(word in value for word in ("heat", "hot day", "warm night")):
        return "heat"
    if any(word in value for word in ("thunder", "lightning", "hail", "wind", "dust")):
        return "storm"
    if any(word in value for word in ("snow", "cold", "frost", "fog")):
        return "other"
    return "all"


def _severity_from_color(value, source=""):
    code = str(value or "").strip().lower()
    if source == "districtnowcast":
        if code.startswith("#"):
            return {"#ff0000": "red", "#ffa500": "orange", "#ffff00": "yellow", "#008000": "green"}.get(code, "unknown")
        return {"1": "green", "2": "yellow", "3": "orange", "4": "red"}.get(code, "unknown")
    if code.startswith("#"):
        return {"#ff0000": "red", "#ffa500": "orange", "#ffff00": "yellow", "#7cfc00": "green"}.get(code, "unknown")
    # IMD district warning reference maps 1=red, 2=orange, 3=yellow, 4=green.
    return {"1": "red", "2": "orange", "3": "yellow", "4": "green"}.get(code, "unknown")


def _warning_events(records, source):
    events = []
    for row in records:
        district = str(_first(row, "District", "district", "District_Name", "Station", "station", "SUBDIV", "subdivision")).strip()
        if not district:
            continue
        state = str(_first(row, "State", "state", "State_Name")).strip()
        issue_date = str(_first(row, "Date", "date", "date_obs", "Date of Issue")).strip()
        issued_time = str(_first(row, "UTC", "toi", "Time", "Update Time")).strip()
        nowcast_codes = []
        if source == "districtnowcast":
            for cat in range(2, 20):
                raw_cat = _first(row, f"Cat{cat}", f"cat{cat}")
                if raw_cat in ("", None, "0", "1", "NIL", "Nil"):
                    continue
                nowcast_codes.append(NOWCAST_NAMES.get(cat, f"IMD nowcast category {cat}"))
            message = str(_first(row, "message", "warning", "description")).strip()
            if message and message.lower() not in ("nil", "none", "no weather"):
                nowcast_codes.append(message)
        for day in range(1, 8):
            raw_codes = _first(row, f"Day_{day}", f"Day{day}_Warning", f"day{day}_warning")
            if source == "districtnowcast" and day == 1 and nowcast_codes:
                raw_codes = "; ".join(dict.fromkeys(nowcast_codes))
            elif raw_codes == "" and day == 1:
                raw_codes = str(_first(row, "message", "warning", "description")).strip()
            if raw_codes == "":
                continue
            tokens = [part.strip() for part in re.split(r"[,;]", str(raw_codes)) if part.strip()]
            for token in tokens:
                try:
                    code = int(float(token))
                except ValueError:
                    title = token
                    if title.lower() in ("nil", "none", "no warning", "no weather", "1"):
                        continue
                else:
                    if code == 1:
                        continue
                    title = WARNING_NAMES.get(code, f"IMD warning code {code}")
                day_color = _first(row, f"Day{day}_Color", f"day{day}_color", "color")
                key_data = "|".join((source, _norm(district), _norm(state), issue_date, issued_time, str(day), title.lower()))
                key = __import__("hashlib").sha256(key_data.encode("utf-8")).hexdigest()
                events.append({
                    "event_key": key,
                    "source": source,
                    "district": district,
                    "state": state,
                    "category": _category_for_title(title),
                    "title": title,
                    "details": str(_first(row, "message", "description", "warning")).strip(),
                    "severity": _severity_from_color(day_color, source),
                    "issue_date": issue_date,
                    "valid_until": str(_first(row, "Vupto", "valid_until", "Validity")).strip(),
                    "source_url": f"{IMD_ROOT}/{source}",
                })
    return events


def collect_imd_alerts():
    gathered = []
    errors = []
    for endpoint in ("districtwarning", "subdivisionwarning", "districtnowcast"):
        try:
            payload = fetch_imd_endpoint(endpoint)
            gathered.extend(_warning_events(_records(payload), endpoint))
        except Exception as error:
            errors.append(f"{endpoint}: {type(error).__name__}: {error}")
    if not gathered and errors:
        raise RuntimeError("; ".join(errors))
    return gathered, errors


def save_alerts(events):
    now = datetime.now(timezone.utc).isoformat()
    with db_connect() as db:
        for event in events:
            db.execute("""
                INSERT INTO official_alerts
                  (event_key, source, district, state, category, title, details, severity, issue_date, valid_until, source_url, observed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(event_key) DO UPDATE SET
                  details=excluded.details, severity=excluded.severity,
                  valid_until=excluded.valid_until, observed_at=excluded.observed_at
            """, (
                event["event_key"], event["source"], event["district"], event["state"],
                event["category"], event["title"], event["details"], event["severity"],
                event["issue_date"], event["valid_until"], event["source_url"], now,
            ))
        db.execute("INSERT INTO service_state(name,value) VALUES('last_poll',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", (now,))


def list_alerts(district="", state="", limit=100):
    clauses = []
    params = []
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
    clauses.append("observed_at >= ?")
    params.append(cutoff)
    if district:
        clauses.append("lower(district) LIKE ?")
        params.append("%" + _norm(district) + "%")
    if state:
        clauses.append("(state='' OR lower(state) LIKE ?)")
        params.append("%" + _norm(state) + "%")
    where = "WHERE " + " AND ".join(clauses)
    with db_connect() as db:
        rows = db.execute(f"SELECT * FROM official_alerts {where} ORDER BY observed_at DESC LIMIT ?", (*params, max(1, min(limit, 250)))).fetchall()
    return [dict(row) for row in rows]


def create_subscription(data, user_id=None):
    email = str(data.get("email", "")).strip().lower()
    district = str(data.get("district", "")).strip()
    state = str(data.get("state", "")).strip()
    telegram_chat_id = str(data.get("telegram_chat_id", "")).strip()
    categories = data.get("categories") or ["all"]
    channels = data.get("channels") or ["dashboard", "email"]
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Enter a valid email address.")
    if not district or not state:
        raise ValueError("Enter the district and state to monitor.")
    allowed_categories = {"all", "rain", "heat", "storm", "other"}
    allowed_channels = {"dashboard", "email", "telegram"}
    categories = sorted(set(categories) & allowed_categories) if isinstance(categories, list) else []
    channels = sorted(set(channels) & allowed_channels) if isinstance(channels, list) else []
    if not categories or not channels:
        raise ValueError("Choose at least one hazard and delivery channel.")
    if "telegram" in channels and not telegram_chat_id:
        raise ValueError("Enter your Telegram chat ID for the signup confirmation.")
    if data.get("consent") is not True:
        raise ValueError("Consent is required to save this notification subscription.")
    now = datetime.now(timezone.utc).isoformat()
    next_report_at = now if "email" in channels else None
    with db_connect() as db:
        inserted = db.execute("""
            INSERT INTO subscriptions(user_id, email, telegram_chat_id, district, state, categories_json, channels_json, consent_at, active, created_at, next_report_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(email, district, state) DO NOTHING
        """, (user_id, email, telegram_chat_id, district, state, json.dumps(categories), json.dumps(channels), now, now, next_report_at))
        row = db.execute("SELECT id FROM subscriptions WHERE email=? AND district=? AND state=?", (email, district, state)).fetchone()
        is_first_signup = inserted.rowcount == 1
        if not is_first_signup:
            db.execute("""
                UPDATE subscriptions
                SET user_id=?, telegram_chat_id=?, categories_json=?, channels_json=?, consent_at=?, active=1,
                    next_report_at=CASE WHEN ? THEN COALESCE(next_report_at, ?) ELSE NULL END,
                    report_attempts=CASE WHEN ? AND next_report_at IS NULL THEN 0 ELSE report_attempts END
                WHERE id=?
            """, (user_id, telegram_chat_id, json.dumps(categories), json.dumps(channels), now,
                  int("email" in channels), now, int("email" in channels), row["id"]))
        return row["id"], is_first_signup


def _analysis_text(report):
    location = report.get("location", {})
    weather = report.get("weather", {})
    lines = [
        f"Location: {location.get('city', '')}, {location.get('state', '')}, {location.get('country', '')}",
        f"Current conditions: {weather.get('temperature', 'N/A')} °C, humidity {weather.get('humidity', 'N/A')}%, "
        f"rainfall {weather.get('rainfall', 'N/A')} mm, wind {weather.get('wind_speed', 'N/A')} km/h.",
    ]
    if report.get("forecast_summary"):
        lines.extend(("", report["forecast_summary"]))
    risks = report.get("risks", {})
    if risks:
        lines.extend(("", "Modeled short-term indicators (not official warnings):"))
        for key, label in (("flood_risk", "Flood"), ("heat_risk", "Heat"), ("wildfire_risk", "Wildfire"), ("cyclone_risk", "Cyclone")):
            if key in risks:
                lines.append(f"{label}: {risks[key]}")
    alerts = report.get("alerts", [])
    if alerts:
        lines.extend(("", "App-generated advisories:", *[str(alert) for alert in alerts]))
    lines.extend(("", "Use official IMD and local authority warnings for emergency decisions."))
    return "\n".join(lines)


def _send_analysis_email(email, report, subject):
    host = os.getenv("SMTP_HOST", "").strip()
    user = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    sender = os.getenv("SMTP_FROM", user).strip()
    if not all((host, user, password, sender)):
        raise RuntimeError("SMTP is not configured")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = email
    message.set_content(_analysis_text(report))
    port = int(os.getenv("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=20) as smtp:
        if os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes"):
            smtp.starttls()
        smtp.login(user, password)
        smtp.send_message(message)


def send_search_analysis_to_subscriber(email, report):
    email = str(email or "").strip().lower()
    if not email:
        return False
    with db_connect() as db:
        subscriptions = db.execute(
            "SELECT channels_json, telegram_chat_id FROM subscriptions WHERE lower(email)=? AND active=1",
            (email,),
        ).fetchall()
    send_email = False
    telegram_chat_ids = set()
    for row in subscriptions:
        channels = set(json.loads(row["channels_json"] or "[]"))
        send_email = send_email or "email" in channels
        chat_id = str(row["telegram_chat_id"] or "").strip()
        if "telegram" in channels and chat_id:
            telegram_chat_ids.add(chat_id)
    if not send_email and not telegram_chat_ids:
        return False
    location = report.get("location", {})
    place = ", ".join(filter(None, (location.get("city"), location.get("state"))))
    subject = f"Disaster Shield analysis: {place}"
    details = []
    sent_count = 0
    attempt_count = int(send_email) + len(telegram_chat_ids)
    if send_email:
        try:
            _send_analysis_email(email, report, subject)
            sent_count += 1
        except Exception as error:
            details.append(f"email: {str(error)[:250]}")
    telegram_body = f"{subject}\n\n{_analysis_text(report)}"
    for chat_id in telegram_chat_ids:
        try:
            _telegram_send(chat_id, telegram_body)
            sent_count += 1
        except Exception as error:
            details.append(f"telegram: {str(error)[:250]}")
    status = "sent" if sent_count == attempt_count else "partial" if sent_count else "failed"
    with db_connect() as db:
        db.execute("INSERT INTO report_deliveries(email, location, kind, status, attempted_at, detail) VALUES (?, ?, 'search', ?, ?, ?)",
                   (email, place, status, datetime.now(timezone.utc).isoformat(), "; ".join(details)))
    return sent_count > 0


def fetch_subscription_analysis(district, state):
    api_key = os.getenv("OPENWEATHER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Weather service is not configured")
    geo = requests.get("https://api.openweathermap.org/geo/1.0/direct",
                       params={"q": f"{district},{state},IN", "limit": 1, "appid": api_key}, timeout=15)
    geo.raise_for_status()
    matches = geo.json()
    if not matches:
        raise RuntimeError("Subscribed location could not be found")
    lat, lon = matches[0]["lat"], matches[0]["lon"]
    current = requests.get("https://api.openweathermap.org/data/2.5/weather",
                           params={"lat": lat, "lon": lon, "units": "metric", "appid": api_key}, timeout=15)
    current.raise_for_status()
    weather = current.json()
    temp = float(weather["main"]["temp"])
    humidity = float(weather["main"]["humidity"])
    wind = round(float(weather.get("wind", {}).get("speed", 0)) * 3.6, 1)
    rain = float(weather.get("rain", {}).get("1h") or weather.get("rain", {}).get("3h") or 0)
    forecast_response = requests.get("https://api.open-meteo.com/v1/forecast", params={
        "latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 7,
        "daily": "temperature_2m_max,precipitation_sum,precipitation_probability_max",
    }, timeout=15)
    forecast_response.raise_for_status()
    daily = forecast_response.json().get("daily", {})
    forecast = []
    def daily_item(field, index):
        values = daily.get(field) or []
        return values[index] if index < len(values) else None
    for i, date in enumerate(daily.get("time", [])):
        forecast.append({
            "date": date,
            "temperature_max": daily_item("temperature_2m_max", i),
            "rainfall": daily_item("precipitation_sum", i),
            "rain_probability": daily_item("precipitation_probability_max", i),
        })
    return {
        "location": {"city": matches[0].get("name", district), "state": matches[0].get("state", state), "country": "IN"},
        "weather": {"temperature": round(temp, 1), "humidity": round(humidity), "rainfall": round(rain, 1), "wind_speed": wind},
        "risks": {
            "flood_risk": round(min(1.0, (rain * 0.6 + humidity * 0.3 + wind * 0.1) / 100), 3),
            "heat_risk": round(min(1.0, (max(temp - 25, 0) * 2 + humidity * 0.3) / 100), 3),
            "wildfire_risk": round(min(1.0, (max(temp - 32, 0) * 1.5 + (100 - humidity) * 0.5 + wind * 0.2) / 100), 3),
            "cyclone_risk": round(min(1.0, (wind * 1.5 + rain * 0.5) / 100), 3),
        },
        "forecast": forecast,
        "forecast_summary": "Seven-day outlook: " + "; ".join(
            f"{day['date']}: high {day['temperature_max']} °C, rain {day['rainfall']} mm (probability {day['rain_probability']}%)"
            for day in forecast
        ),
        "alerts": [],
    }


def record_subscription_report_result(subscription_id, success, error=""):
    now = datetime.now(timezone.utc)
    with db_connect() as db:
        row = db.execute("SELECT email, district, state, report_attempts FROM subscriptions WHERE id=?", (subscription_id,)).fetchone()
        if not row:
            return
        attempts = 0 if success else row["report_attempts"] + 1
        next_due = (now + timedelta(days=5)).isoformat() if success else (now + timedelta(minutes=15)).isoformat() if attempts < 5 else None
        db.execute("UPDATE subscriptions SET last_report_at=CASE WHEN ? THEN ? ELSE last_report_at END, next_report_at=?, report_attempts=? WHERE id=?",
                   (int(success), now.isoformat(), next_due, attempts, subscription_id))
        db.execute("INSERT INTO report_deliveries(email, location, kind, status, attempted_at, detail) VALUES (?, ?, 'subscription', ?, ?, ?)",
                   (row["email"], f"{row['district']}, {row['state']}", "sent" if success else "failed", now.isoformat(), error[:500]))


def deliver_scheduled_analysis_reports():
    now = datetime.now(timezone.utc).isoformat()
    with db_connect() as db:
        rows = db.execute("SELECT * FROM subscriptions WHERE active=1 AND next_report_at IS NOT NULL AND next_report_at<=? AND report_attempts<5", (now,)).fetchall()
    for row in rows:
        if "email" not in json.loads(row["channels_json"] or "[]"):
            continue
        try:
            report = fetch_subscription_analysis(row["district"], row["state"])
            _send_analysis_email(row["email"], report, f"Your 5-day Disaster Shield analysis: {row['district']}, {row['state']}")
            record_subscription_report_result(row["id"], True)
        except Exception as error:
            record_subscription_report_result(row["id"], False, str(error))


def send_signup_confirmations(email, telegram_chat_id, district, state, report=None, channels=None):
    """Attempt one-time email and Telegram confirmations for a new signup."""
    subject = "You are subscribed to Disaster Shield alerts"
    body = (
        f"You have successfully subscribed to Disaster Shield updates for "
        f"{district}, {state}. You will receive updates based on the location "
        "and alert preferences you provided.\n\n"
        "Official weather warnings are shared when available from the configured "
        "source. Follow local authorities for emergency instructions."
    )
    if report:
        body += "\n\nYour first location analysis:\n\n" + _analysis_text(report)
    results = {}
    try:
        host = os.getenv("SMTP_HOST", "").strip()
        user = os.getenv("SMTP_USERNAME", "").strip()
        password = os.getenv("SMTP_PASSWORD", "").strip()
        sender = os.getenv("SMTP_FROM", user).strip()
        if not all((host, user, password, sender)):
            raise RuntimeError("Email provider is not configured")
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = sender
        message["To"] = email
        message.set_content(body)
        port = int(os.getenv("SMTP_PORT", "587"))
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            if os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes"):
                smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(message)
        results["email"] = {"sent": True}
    except Exception as error:
        results["email"] = {"sent": False, "error": str(error)[:250]}

    if "telegram" in (channels or []):
        try:
            _telegram_send(telegram_chat_id, body)
            results["telegram"] = {"sent": True}
        except Exception as error:
            results["telegram"] = {"sent": False, "error": str(error)[:250]}
    return results


def _email_send(recipient, event):
    host = os.getenv("SMTP_HOST", "").strip()
    user = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    sender = os.getenv("SMTP_FROM", user).strip()
    if not all((host, user, password, sender)):
        raise RuntimeError("SMTP is not configured")
    message = EmailMessage()
    message["Subject"] = f"{event['severity'].upper()} IMD alert: {event['title']} - {event['district']}"
    message["From"] = sender
    message["To"] = recipient
    message.set_content(
        f"Official weather alert from {event['source']}\n\n"
        f"Location: {event['district']}, {event['state']}\n"
        f"Hazard: {event['title']}\nSeverity: {event['severity']}\n"
        f"Issued: {event['issue_date']}\nValid until: {event['valid_until'] or 'Not supplied'}\n\n"
        f"{event['details']}\n\nSource: {event['source_url']}\n"
        "Follow official local authorities for instructions."
    )
    port = int(os.getenv("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=20) as smtp:
        if os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes"):
            smtp.starttls()
        smtp.login(user, password)
        smtp.send_message(message)


def _telegram_send(chat_id, body):
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("Telegram bot is not configured")
    response = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": body}, timeout=20,
    )
    response.raise_for_status()
    result = response.json()
    if not result.get("ok"):
        raise RuntimeError(result.get("description", "Telegram message failed"))


def deliver_new_alerts(events):
    now = datetime.now(timezone.utc).isoformat()
    with db_connect() as db:
        subscriptions = [dict(row) for row in db.execute("SELECT * FROM subscriptions WHERE active=1").fetchall()]
    for event in events:
        for sub in subscriptions:
            if event["source"] == "subdivisionwarning":
                region = _norm(event["district"])
                subscriber_state = _norm(sub["state"])
                if subscriber_state not in region and region not in subscriber_state:
                    continue
            elif _norm(event["district"]) != _norm(sub["district"]):
                continue
            if event["state"] and _norm(event["state"]) != _norm(sub["state"]):
                continue
            categories = set(json.loads(sub["categories_json"]))
            if "all" not in categories and event["category"] not in categories:
                continue
            channels = set(json.loads(sub["channels_json"]))
            for channel in channels:
                if channel == "dashboard":
                    continue
                with db_connect() as db:
                    previous = db.execute("SELECT status, attempts FROM deliveries WHERE event_key=? AND subscription_id=? AND channel=?", (event["event_key"], sub["id"], channel)).fetchone()
                if previous and (previous["status"] == "sent" or previous["attempts"] >= 5):
                    continue
                attempts = (previous["attempts"] + 1) if previous else 1
                try:
                    if channel == "email":
                        _email_send(sub["email"], event)
                    elif channel == "telegram":
                        _telegram_send(sub["telegram_chat_id"], f"{event['severity'].upper()} IMD {event['title']} for {event['district']}, {event['state']}. Issued {event['issue_date']}. Follow local authorities.")
                    status, detail = "sent", ""
                except Exception as error:
                    status, detail = "failed", str(error)[:500]
                with db_connect() as db:
                    db.execute("""
                        INSERT INTO deliveries(event_key, subscription_id, channel, status, attempted_at, detail, attempts)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(event_key, subscription_id, channel) DO UPDATE SET
                          status=excluded.status, attempted_at=excluded.attempted_at,
                          detail=excluded.detail, attempts=excluded.attempts
                    """, (event["event_key"], sub["id"], channel, status, now, detail, attempts))


def subscription_logs(limit=80, user_id=None):
    with db_connect() as db:
        query = """
            SELECT d.status, d.channel, d.attempted_at, d.detail,
                   a.title, a.district, a.state, a.severity, a.source, a.issue_date
            FROM deliveries d JOIN official_alerts a ON a.event_key=d.event_key
            JOIN subscriptions s ON s.id=d.subscription_id
        """
        params = [limit]
        if user_id is not None:
            query += " WHERE s.user_id=?"
            params.insert(0, user_id)
        query += " ORDER BY d.attempted_at DESC LIMIT ?"
        rows = db.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def last_poll():
    with db_connect() as db:
        row = db.execute("SELECT value FROM service_state WHERE name='last_poll'").fetchone()
    return row["value"] if row else None


def last_error():
    with db_connect() as db:
        row = db.execute("SELECT value FROM service_state WHERE name='last_error'").fetchone()
    return row["value"] if row else None


def set_service_state(name, value):
    with db_connect() as db:
        db.execute("INSERT INTO service_state(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", (name, str(value)))
