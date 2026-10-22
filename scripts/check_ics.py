"""Parses an exported Untangle calendar with the icalendar library, an independent iCalendar implementation, and checks
the events. usage: python3 scripts/check_ics.py <file.ics>   (pip install icalendar)"""
import sys
from datetime import date, datetime, timedelta

from icalendar import Calendar

cal = Calendar.from_ical(open(sys.argv[1], "rb").read())
assert str(cal["VERSION"]) == "2.0"
events = list(cal.walk("VEVENT"))
uids = [str(e["UID"]) for e in events]
assert len(uids) == len(set(uids)), "duplicate UIDs"
timed = allday = 0
for e in events:
    begin, end = e.decoded("DTSTART"), e.decoded("DTEND")
    alarms = list(e.walk("VALARM"))
    assert len(alarms) == 1, "one reminder per event"
    trigger = alarms[0].decoded("TRIGGER")
    if type(begin) is datetime:
        assert end - begin == timedelta(minutes=15) and trigger == timedelta(hours=-1)
        timed += 1
    else:
        assert type(begin) is date and end - begin == timedelta(days=1) and trigger == timedelta(hours=9)
        allday += 1
print(f"ok: {len(events)} events ({timed} at a time with a reminder an hour before, {allday} all-day with a 9 am reminder), unique UIDs")
