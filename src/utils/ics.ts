import type { CalendarEvent } from "../types";

type CalendarEventIcsOptions = {
  description?: string;
  location?: string;
};

const EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function parseEventDate(dateText: string) {
  const date = new Date(dateText);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getCalendarEventIcsFileName(calendarEvent: CalendarEvent) {
  return `goyo-${calendarEvent.id}.ics`;
}

export function calendarEventToIcs(
  calendarEvent: CalendarEvent,
  options: CalendarEventIcsOptions = {}
) {
  const startDate = parseEventDate(calendarEvent.date);
  if (!startDate) {
    return null;
  }

  const endDate = new Date(startDate.getTime() + EVENT_DURATION_MS);
  const now = new Date();
  const description = options.description ?? "";
  const location = options.location ?? "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GOYO//Music Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:goyo-${escapeIcsText(calendarEvent.id)}@goyo`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(startDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:${escapeIcsText(calendarEvent.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

export function downloadCalendarEventIcs(
  calendarEvent: CalendarEvent,
  options: CalendarEventIcsOptions = {}
) {
  const ics = calendarEventToIcs(calendarEvent, options);
  if (!ics) {
    return false;
  }

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getCalendarEventIcsFileName(calendarEvent);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return true;
}
