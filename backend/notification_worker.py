"""Poll official IMD warning feeds and deliver new district alerts."""
import os
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
from notification_service import (
    collect_imd_alerts,
    db_connect,
    deliver_new_alerts,
    deliver_scheduled_analysis_reports,
    initialize_database,
    save_alerts,
    set_service_state,
)


def process_once():
    events, errors = collect_imd_alerts()
    with db_connect() as db:
        known = {row[0] for row in db.execute("SELECT event_key FROM official_alerts").fetchall()}
    new_events = [event for event in events if event["event_key"] not in known]
    save_alerts(events)
    deliver_new_alerts(events)
    deliver_scheduled_analysis_reports()
    set_service_state("last_error", " | ".join(errors) if errors else "")
    print(f"IMD poll complete: {len(events)} active warnings; {len(new_events)} new; {len(errors)} source errors")
    for error in errors:
        print(error)


def main():
    initialize_database()
    interval = max(60, int(os.getenv("ALERTS_POLL_INTERVAL_SECONDS", "300")))
    print(f"Disaster Shield notification worker started (poll every {interval}s)")
    while True:
        try:
            process_once()
        except Exception as error:
            set_service_state("last_error", f"{type(error).__name__}: {error}")
            print(f"IMD poll failed: {type(error).__name__}: {error}")
        time.sleep(interval)


if __name__ == "__main__":
    main()
