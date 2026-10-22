// Writes the dated steps as an iCalendar file (RFC 5545). A step with a time becomes a 15-minute event at that time with
// a reminder an hour before; a step with only a date becomes an all-day event with a 9 am reminder.

import { addDays } from './dates'
import type { Step } from './parse'

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Splits a content line into lines of at most 75 octets without cutting a UTF-8 character. */
export function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let size = 0
  let limit = 75
  for (const ch of line) {
    const n = encoder.encode(ch).length
    if (size + n > limit) {
      parts.push(current)
      current = ''
      size = 0
      limit = 74 // a continuation line starts with one space
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

function hash(s: string): string {
  let h = 0x811c9dc5
  for (const ch of s) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const compact = (isoDate: string) => isoDate.replaceAll('-', '')

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Floating local time (no time zone): 17:00 means 5 pm wherever the calendar is opened. */
function localDateTime(date: string, time: string, plusMinutes = 0): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + plusMinutes
  const day = addDays(date, Math.floor(total / 1440))
  const mins = ((total % 1440) + 1440) % 1440
  return `${compact(day)}T${String(Math.floor(mins / 60)).padStart(2, '0')}${String(mins % 60).padStart(2, '0')}00`
}

export function datedSteps(steps: Step[]): Step[] {
  return steps.filter((s) => s.when?.date)
}

export function buildIcs(steps: Step[], title: string, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Untangle//Checklist//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(title)}`]
  for (const s of datedSteps(steps)) {
    const w = s.when!
    const date = w.date!
    const summary = `${w.kind === 'deadline' ? 'Due: ' : ''}${s.text}`.slice(0, 200)
    lines.push('BEGIN:VEVENT', `UID:${hash(`${title}|${s.original}|${date}`)}@untangle`, `DTSTAMP:${stamp(now)}`)
    if (w.time) {
      lines.push(`DTSTART:${localDateTime(date, w.time)}`, `DTEND:${localDateTime(date, w.time, 15)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(date)}`, `DTEND;VALUE=DATE:${compact(addDays(date, 1))}`, 'TRANSP:TRANSPARENT')
    }
    lines.push(`SUMMARY:${escapeText(summary)}`, `DESCRIPTION:${escapeText(`From "${title}": ${s.original}`)}`)
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(s.text.slice(0, 120))}`, `TRIGGER:${w.time ? '-PT1H' : 'PT9H'}`, 'END:VALARM', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** The checklist as plain text with boxes, for pasting into notes or a to-do app. */
export function asText(title: string, steps: Step[], done: Set<string>, ready: string[], warnings: string[]): string {
  const out = [title, '']
  if (ready.length) out.push('Have ready:', ...ready.map((r) => `- ${r}`), '')
  if (warnings.length) out.push('Watch out:', ...warnings.map((w) => `- ${w}`), '')
  out.push('Steps:')
  steps.forEach((s, k) => out.push(`${done.has(s.id) ? '[x]' : '[ ]'} ${k + 1}. ${s.text}${s.condition ? ` (${s.condition})` : ''}`))
  return out.join('\n') + '\n'
}
