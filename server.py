"""Local site server with a site-visit booking schedule.

Times are America/Edmonton. Weekdays offer six visit windows.
Saturday morning offers two. Sunday is closed. A booked window
cannot be taken again.
"""

from __future__ import annotations

import json
import re
import secrets
import threading
from datetime import date, datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "bookings.json"
TZ = ZoneInfo("America/Edmonton")
LOCK = threading.Lock()
LEAD = timedelta(hours=2)
HORIZON_DAYS = 90

WEEKDAY_TIMES = ["08:00", "09:30", "11:00", "13:00", "14:30", "16:00"]
SATURDAY_TIMES = ["09:00", "11:00"]

SERVICES = {
    "Concrete finishing",
    "Full service lawncare",
    "Patios",
    "Sidewalks",
    "Driveways",
    "Curb & gutter",
    "Stamped concrete",
    "Exposed aggregate",
    "Concrete cutting & demolition",
    "Commercial properties",
    "Industrial properties",
    "Parking lots",
    "Parkades",
    "Plazas",
    "Condominiums",
    "Strip malls",
    "Acreages",
    "Snow hauling",
    "Excavating & grading",
    "Fences",
    "Renovations / new construction / basements",
    "Concrete & asphalt",
    "Building maintenance",
    "Property management",
    "Interior / exterior painting",
    "Electrical repairs",
    "Plumbing",
    "Parkade & parking lot sweeping",
    "Line painting",
    "General cleanup & repairs",
    "Stucco & plaster",
    "Something else",
}
PROPERTIES = {"Residential", "Commercial", "Industrial"}


def now() -> datetime:
    return datetime.now(TZ)


def load() -> list[dict]:
    if not DATA.exists():
        return []
    return json.loads(DATA.read_text(encoding="utf-8-sig"))


def save(items: list[dict]) -> None:
    DATA.parent.mkdir(exist_ok=True)
    DATA.write_text(json.dumps(items, indent=2), encoding="utf-8", newline="\n")


def times_for(day: date) -> list[str]:
    if day.weekday() == 6:
        return []
    if day.weekday() == 5:
        return list(SATURDAY_TIMES)
    return list(WEEKDAY_TIMES)


def open_times(day: date, taken: set[str], moment: datetime) -> list[str]:
    if day < moment.date() or day > (moment.date() + timedelta(days=HORIZON_DAYS)):
        return []
    available = []
    for stamp in times_for(day):
        hour, minute = (int(part) for part in stamp.split(":"))
        start = datetime(day.year, day.month, day.day, hour, minute, tzinfo=TZ)
        if start < moment + LEAD:
            continue
        if f"{day.isoformat()} {stamp}" in taken:
            continue
        available.append(stamp)
    return available


def month_days(year: int, month: int) -> list[dict]:
    moment = now()
    with LOCK:
        taken = {f"{item['date']} {item['time']}" for item in load()}
    first = date(year, month, 1)
    if month == 12:
        last = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last = date(year, month + 1, 1) - timedelta(days=1)
    days = []
    cursor = first
    while cursor <= last:
        slots = open_times(cursor, taken, moment)
        reason = ""
        if cursor.weekday() == 6:
            reason = "sunday"
        elif cursor < moment.date():
            reason = "past"
        elif not slots and cursor <= moment.date() + timedelta(days=HORIZON_DAYS):
            reason = "full"
        days.append(
            {
                "date": cursor.isoformat(),
                "times": slots,
                "open": bool(slots),
                "reason": reason,
            }
        )
        cursor += timedelta(days=1)
    return days


def clean(value: object, limit: int) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/availability":
            self.availability(parse_qs(parsed.query))
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path == "/api/bookings":
            self.create_booking()
            return
        self.send_error(404)

    def availability(self, query: dict) -> None:
        moment = now()
        try:
            year = int(query.get("year", [moment.year])[0])
            month = int(query.get("month", [moment.month])[0])
            if month < 1 or month > 12:
                raise ValueError
        except ValueError:
            self.respond(400, {"error": "Choose a real month."})
            return
        self.respond(
            200,
            {
                "timezone": "America/Edmonton",
                "year": year,
                "month": month,
                "today": moment.date().isoformat(),
                "days": month_days(year, month),
            },
        )

    def create_booking(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > 20000:
            self.respond(400, {"error": "That request could not be read."})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.respond(400, {"error": "That request could not be read."})
            return

        name = clean(payload.get("name"), 80)
        phone = clean(payload.get("phone"), 30)
        email = clean(payload.get("email"), 120)
        property_type = clean(payload.get("property"), 20)
        service = clean(payload.get("service"), 80)
        day_text = clean(payload.get("date"), 10)
        stamp = clean(payload.get("time"), 5)
        address = clean(payload.get("address"), 160)
        notes = clean(payload.get("notes"), 1000)

        if len(name) < 2:
            self.respond(400, {"error": "Add your name."})
            return
        if len(re.sub(r"\D", "", phone)) < 7:
            self.respond(400, {"error": "Add a phone number."})
            return
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            self.respond(400, {"error": "Add an email address."})
            return
        if property_type not in PROPERTIES:
            self.respond(400, {"error": "Choose residential, commercial, or industrial."})
            return
        if service not in SERVICES:
            self.respond(400, {"error": "Choose a service from the list."})
            return
        if len(address) < 5:
            self.respond(400, {"error": "Add the site address."})
            return
        try:
            day = date.fromisoformat(day_text)
        except ValueError:
            self.respond(400, {"error": "Choose a date on the calendar."})
            return
        if stamp not in times_for(day):
            self.respond(400, {"error": "Choose an open time."})
            return

        moment = now()
        with LOCK:
            items = load()
            taken = {f"{item['date']} {item['time']}" for item in items}
            if stamp not in open_times(day, taken, moment):
                self.respond(409, {"error": "That time was just taken. Choose another."})
                return
            booking_id = self.fresh_id(items)
            record = {
                "id": booking_id,
                "createdAt": moment.isoformat(timespec="seconds"),
                "name": name,
                "phone": phone,
                "email": email,
                "property": property_type,
                "service": service,
                "date": day.isoformat(),
                "time": stamp,
                "address": address,
                "notes": notes,
            }
            items.append(record)
            save(items)
        self.respond(201, record)

    def fresh_id(self, items: list[dict]) -> str:
        existing = {item["id"] for item in items}
        while True:
            booking_id = "ALT-" + secrets.token_hex(2).upper()
            if booking_id not in existing:
                return booking_id

    def respond(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print("Alta site and booking schedule at http://127.0.0.1:8765/")
    server.serve_forever()


if __name__ == "__main__":
    main()
