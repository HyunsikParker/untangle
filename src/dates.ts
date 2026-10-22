// Finds dates and times in instruction text. Relative words ("by Friday", "tomorrow", "within 10 business days") are
// resolved against the day the message was received, which the reader can change.

export interface When {
  date: string | null // YYYY-MM-DD
  time: string | null // HH:MM, 24-hour
  label: string // the words as written, e.g. "by Friday, October 16 at 5 p.m."
  kind: 'deadline' | 'on'
  index: number
  length: number
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
}
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')
const WEEKDAY_RE = '(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?'
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fourteen: 14, thirty: 30 }

export function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(s: string, n: number): string {
  const d = parseIso(s)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  return valid(y, m, d)
}

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

function weekdayIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3)
  return WEEKDAYS.findIndex((d) => d.startsWith(w))
}

/** The first date after the reference day that falls on the given weekday ("by Friday" sent on a Friday means next week). */
export function nextWeekday(ref: string, dow: number): string {
  const diff = (dow - parseIso(ref).getUTCDay() + 7) % 7
  return addDays(ref, diff === 0 ? 7 : diff)
}

/** A month and day without a year: the occurrence from a week before the reference day onwards. */
function yearFor(m: number, d: number, ref: string): number {
  const y = parseIso(ref).getUTCFullYear()
  if (!valid(y, m, d)) return y + 1
  const candidate = iso(new Date(Date.UTC(y, m - 1, d)))
  return candidate < addDays(ref, -7) ? y + 1 : y
}

function addBusinessDays(ref: string, n: number): string {
  let d = ref
  let left = n
  while (left > 0) {
    d = addDays(d, 1)
    const dow = parseIso(d).getUTCDay()
    if (dow !== 0 && dow !== 6) left--
  }
  return d
}

function parseTime(text: string): { time: string; index: number; length: number } | null {
  const named = /\b(noon|midday|midnight)\b/i.exec(text)
  const clock = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?![a-z])/i.exec(text)
  const h24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:a\.?m|p\.?m))/i.exec(text)
  const found: { time: string; index: number; length: number }[] = []
  if (named) found.push({ time: /mid(?!day)/i.test(named[1]) && /night/i.test(named[1]) ? '23:59' : '12:00', index: named.index, length: named[0].length })
  if (clock) {
    let h = +clock[1] % 12
    if (/p/i.test(clock[3])) h += 12
    const m = clock[2] ?? '00'
    if (+clock[1] >= 1 && +clock[1] <= 12) found.push({ time: `${String(h).padStart(2, '0')}:${m}`, index: clock.index, length: clock[0].length })
  }
  if (h24) found.push({ time: `${h24[1].padStart(2, '0')}:${h24[2]}`, index: h24.index, length: h24[0].length })
  if (!found.length) return null
  found.sort((a, b) => a.index - b.index)
  const t = found[0]
  const tail = /^\s*(?:noon|midday|midnight)\b/i.exec(text.slice(t.index + t.length)) // "12:00 noon"
  return tail ? { ...t, length: t.length + tail[0].length } : t
}

interface DateHit {
  date: string
  index: number
  length: number
}

/**
 * Whether "within 10 days" counts from something that has not happened yet ("After you upload your documents, ...",
 * "within 30 days of your move-out") rather than from the day the message arrived ("within 10 days of receiving this").
 */
function countsFromLater(text: string, index: number, length: number): boolean {
  const after = text.slice(index + length)
  if (/^\s+(?:of|after|from|following)\s+(?:(?:the\s+)?(?:date\s+(?:of|on)\s+)?(?:this|receiving|receipt|today)\b)/i.test(after)) return false
  if (/^\s+(?:of|after|from|following)\s+\w/i.test(after)) return true
  const sentenceStart = Math.max(...['.', '!', '?', '\n'].map((c) => text.lastIndexOf(c, index - 1))) + 1
  return /\b(?:after|once|when|as soon as)\s+(?:you|we|your|the|they|it)\b/i.test(text.slice(sentenceStart, index))
}

/** Every calendar date mentioned in the text, resolved against the reference day. */
export function findDates(text: string, ref: string): DateHit[] {
  const hits: DateHit[] = []
  const push = (y: number, mo: number, d: number, index: number, length: number) => {
    if (valid(y, mo, d)) hits.push({ date: iso(new Date(Date.UTC(y, mo - 1, d))), index, length })
  }
  let m: RegExpExecArray | null
  const isoRe = /\b(20\d{2})-(\d{2})-(\d{2})\b/g
  while ((m = isoRe.exec(text))) push(+m[1], +m[2], +m[3], m.index, m[0].length)

  const md = new RegExp(`\\b(?:${WEEKDAY_RE},?\\s+)?(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`, 'gi')
  while ((m = md.exec(text))) {
    const mo = MONTHS[m[1].toLowerCase()], d = +m[2]
    push(m[3] ? +m[3] : yearFor(mo, d, ref), mo, d, m.index, m[0].length)
  }
  const dm = new RegExp(`\\b(?:${WEEKDAY_RE},?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\.?(?:,?\\s*(20\\d{2}))?\\b`, 'gi')
  while ((m = dm.exec(text))) {
    const mo = MONTHS[m[2].toLowerCase()], d = +m[1]
    push(m[3] ? +m[3] : yearFor(mo, d, ref), mo, d, m.index, m[0].length)
  }
  const slash = /(?<![\d/.])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])(?!\s*(?:pages?|of\b|hours?|cups?))/g
  while ((m = slash.exec(text))) {
    const mo = +m[1], d = +m[2]
    let y = m[3] ? +m[3] : yearFor(mo, d, ref)
    if (y < 100) y += 2000
    push(y, mo, d, m.index, m[0].length)
  }
  const rel: [RegExp, (mm: RegExpExecArray) => string][] = [
    [/\b(today|tonight|this evening)\b/gi, () => ref],
    [/\btomorrow\b/gi, () => addDays(ref, 1)],
    [/\bthe day after tomorrow\b/gi, () => addDays(ref, 2)],
    [/\b(?:this|next|coming)?\s*(?:end of (?:the )?week)\b/gi, () => nextWeekday(ref, 5)],
    [/\b(?:the )?end of (?:the |this )?month\b/gi, () => {
      const d = parseIso(ref)
      return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
    }],
    [/\bwithin\s+(\d{1,3}|[a-z]+)\s+(business|working|calendar)?\s*days?\b/gi, (mm) => {
      const n = /^\d+$/.test(mm[1]) ? +mm[1] : NUM_WORDS[mm[1].toLowerCase()] ?? NaN
      if (!Number.isFinite(n) || countsFromLater(text, mm.index, mm[0].length)) return ''
      return mm[2] && /business|working/i.test(mm[2]) ? addBusinessDays(ref, n) : addDays(ref, n)
    }],
    [/\b(?:within|in)\s+(\d{1,2}|[a-z]+)\s+weeks?\b/gi, (mm) => {
      const n = /^\d+$/.test(mm[1]) ? +mm[1] : NUM_WORDS[mm[1].toLowerCase()] ?? NaN
      return Number.isFinite(n) && !countsFromLater(text, mm.index, mm[0].length) ? addDays(ref, n * 7) : ''
    }],
  ]
  for (const [re, fn] of rel) {
    while ((m = re.exec(text))) {
      const date = fn(m)
      if (date) hits.push({ date, index: m.index, length: m[0].length })
    }
  }
  // A weekday on its own ("by Friday", "next Tuesday") when no calendar date sits right next to it.
  // Opening hours ("Monday to Friday, 9 a.m. to 4 p.m.", "every Tuesday") repeat; they are not a date to act on.
  const repeating: [number, number][] = []
  const span = new RegExp(`\\b${WEEKDAY_RE}\\s*(?:-|–|—|to|through|thru|until|till)\\s*${WEEKDAY_RE}\\b|\\b(?:every|each)\\s+${WEEKDAY_RE}\\b`, 'gi')
  while ((m = span.exec(text))) repeating.push([m.index, m.index + m[0].length])
  const wd = new RegExp(`\\b(?:(this|next|coming)\\s+)?(${WEEKDAY_RE})\\b`, 'gi')
  while ((m = wd.exec(text))) {
    const start = m.index
    const covered = hits.some((h) => start >= h.index - 1 && start < h.index + h.length)
    if (covered || repeating.some(([a, b]) => start >= a && start < b)) continue
    const dow = weekdayIndex(m[2])
    if (dow < 0) continue
    hits.push({ date: nextWeekday(ref, dow), index: m.index, length: m[0].length })
  }
  hits.sort((a, b) => a.index - b.index || b.length - a.length)
  const out: DateHit[] = []
  for (const h of hits) {
    const last = out[out.length - 1]
    if (last && h.index < last.index + last.length) continue
    out.push(h)
  }
  return out
}

// A deadline word right before the date or time, allowing a few filler words ("by the end of", "before noon on").
// "Before" words keep their meaning across a few words ("before your appointment on Tuesday"); "by" does not ("by courier on").
const DEADLINE_CUE = /\b(?:(?:by|due|deadline(?: is)?|at the latest|expires?|closes?)\s+(?:(?:the|this|next|coming|end|of|on|at|close|business|day|following)\s+){0,3}|(?:before|no later than|not later than|until|till|prior to|on or before)\s+(?:[\w'-]+\s+){0,4})$/i

/** The date (and time) a sentence is about, and whether it reads as a deadline or a scheduled moment. */
export function findWhen(text: string, ref: string): When | null {
  const dates = findDates(text, ref)
  const time = parseTime(text)
  if (!dates.length && !time) return null
  const first = dates[0]
  let anchor = first ? first.index : time!.index
  // "by 5 p.m. on Friday": the time comes first and the deadline word sits before it.
  if (first && time && time.index < first.index && first.index - (time.index + time.length) <= 8) anchor = time.index
  const before = text.slice(Math.max(0, anchor - 40), anchor)
  const cue = DEADLINE_CUE.exec(before)
  const kind: When['kind'] = cue || (first && /^within\b/i.test(text.slice(first.index))) ? 'deadline' : 'on'
  // The label runs from the deadline word (if any) to the end of the date and time.
  const start = cue ? anchor - (before.length - cue.index) : anchor
  const endDate = first ? first.index + first.length : anchor
  const endTime = time && time.index >= anchor - 2 && time.index - endDate < 12 ? time.index + time.length : endDate
  const end = Math.max(endDate, endTime)
  const label = text.slice(start, end).replace(/\s+/g, ' ').replace(/[,;:]$/, '').trim()
  return {
    date: first ? first.date : null,
    time: time ? time.time : null,
    label,
    kind,
    index: start,
    length: end - start,
  }
}
