import { describe, expect, it } from 'vitest'
import { asText, buildIcs, fold } from './ics'
import { untangle } from './parse'
import { samples } from './sample'

const octets = (s: string) => new TextEncoder().encode(s).length

describe('calendar and text export', () => {
  const s = samples('2026-10-26').find((x) => x.id === 'aid')!
  const r = untangle(s.text, s.received)
  const ics = buildIcs(r.steps, 'Financial aid', new Date(Date.UTC(2026, 9, 26, 9)))

  it('writes timed and all-day events with reminders', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.split('\r\n').every((l) => octets(l) <= 75)).toBe(true)
    const flat = ics.replace(/\r\n /g, '')
    expect(flat).toContain('DTSTART:20261106T170000\r\nDTEND:20261106T171500')
    expect(flat).toContain('TRIGGER:-PT1H')
    expect(flat).toContain('DTSTART;VALUE=DATE:20261109\r\nDTEND;VALUE=DATE:20261110')
    expect(flat).toContain('TRIGGER:PT9H')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  })

  it('folds without splitting characters', () => {
    const line = 'SUMMARY:' + 'é–'.repeat(40)
    expect(fold(line).split('\r\n').every((l) => octets(l) <= 75)).toBe(true)
    expect(fold(line).replace(/\r\n /g, '')).toBe(line)
  })

  it('copies the checklist as text with boxes', () => {
    const text = asText('Financial aid', r.steps, new Set([r.steps[0].id]), r.ready.map((x) => x.text), [])
    expect(text).toContain('Have ready:\n- A signed copy of the 2027-28 Verification Worksheet')
    expect(text).toContain('[x] 1. Submit the following documents')
    expect(text).toContain('[ ] 2. One of your parents must also sign the worksheet. (If you are a dependent student)')
  })
})
