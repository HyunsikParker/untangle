// Turns a block of instructions into steps, things to have ready, warnings, dates and contacts. It reads sentence by
// sentence and list item by list item; nothing is sent anywhere. Every result keeps the sentence it came from, so the
// reader can always check the original wording.

import { findWhen, type When } from './dates'

export interface Step {
  id: string
  text: string // rewritten as a short instruction
  original: string // the sentence as written
  when: When | null
  condition: string | null // "If you are a dependent student"
  contacts: Contact[]
}

export interface Contact {
  kind: 'email' | 'link' | 'phone'
  value: string
}

export interface Note {
  text: string
  original: string
}

export interface KeyDate {
  when: When
  text: string // the sentence it came from
  stepId: string | null
}

export interface Untangled {
  steps: Step[]
  ready: Note[] // things to have ready
  warnings: Note[]
  dates: KeyDate[] // every dated sentence, steps and background alike, in date order
  contacts: Contact[]
  background: string[]
}

// Verbs that start an instruction, matched against the first word after "please", "then", "next" and similar lead-ins.
const VERBS = new Set(`
accept access activate add answer apply arrange ask attach attend back bake book bring call cancel carry change check
choose clean clear click close collect come complete confirm connect contact copy cover create cut date decide defrost
delete describe disconnect dispose do double-check download drain drop email empty enable enroll enrol enter fill find
finish fix follow forward get give go hand have include inform install keep label leave let list lock log look mail make
mark meet mop move note notify open order pack park patch pay photograph pick place plan post prepare present print
provide put read recycle register reply report request reserve reset return review remove renew repair replace save scan
schedule select send set share show sign start stop store submit sweep switch take tell test text tick transfer turn
unplug update upload use vacuum verify visit vote wait wash wear wipe write
analyse analyze arrive calculate charge cite compare discuss draw dress explain feed format graph head invite join
measure memorize memorise name number organise organize plot plug practice practise proofread reboot reference remind
rename restart revise ship sort staple study summarise summarize sync tidy title unlock water watch
`.trim().split(/\s+/))

const LEAD_IN = /^(?:(?:please|kindly|also|then|next|now|first|firstly|second|secondly|third|thirdly|finally|lastly|afterwards|after that|in addition|additionally|as well|(?:once|after|before|when|to|so that)\s[^,]{2,60})\s*,?\s+)+/i

const SUBJECT = '(?:you|students?|applicants?|tenants?|residents?|employees?|participants?|members?|everyone)'
const MODAL = '(?:(?:will|would)\\s+)?(?:must|need to|needs to|have to|has to|are required to|is required to|should|are expected to|are asked to)\\s+(?:also\\s+|then\\s+|first\\s+)?'
const OBLIGATION = new RegExp(`\\b${SUBJECT}\\s+${MODAL}(\\w+)`, 'i')
const OTHER_OBLIGATION = /\b(?:must|should|needs? to|has to|is required to)\s+(?:also\s+)?(\w+)/i // "one of your parents must also sign"
const REMINDER = /^(?:please\s+)?(?:make sure|be sure|ensure|remember|it is important to|it's important to)\b/i
const NEGATIVE = /^(?:please\s+)?(?:do not|don't|never|avoid)\b/i
const WARNING_WORDS = /\b(do not|don't|must not|never|late|penalt(?:y|ies)|fine[sd]?|forfeit|will not be (?:accepted|processed|considered|returned|refunded|paid)|won't be (?:accepted|processed|returned|refunded)|cannot be|can't be|fail(?:ure)? to|otherwise|warning|no exceptions|deducted|charged|non-refundable|at your own risk|delay|not (?:allowed|permitted|accepted|provided)|prohibited|forbidden)\b/i
const DUE = /\b(?:is|are)\s+due\b/i // "Submissions are due Sunday at midnight": a deadline stated without a verb for the reader
const READY_CUE = /\b(you(?:'ll| will)? need(?! to (?:submit|send|upload|complete|sign|pay|return|book|call|email))|you will be asked for|please (?:have|bring)|bring(?: the following| with you)?|have (?:the following )?ready|have on hand|required documents|documents? (?:required|needed)|what to bring|the following documents|you should have)\b/i
const QUESTION_WORDS = /\b(questions?|unsure|need help|any problems|concerns?)\b/i
const READ_THIS = /^(?:read|follow) (?:this|these|the) (?:whole |entire |full )?(?:message|email|letter|notice|page|steps|instructions|guidelines)\b/i // pointers to the text itself

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const URL = /\b(?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?'"]|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|edu|gov|net|example|io|ac\.[a-z]{2})\/[^\s<>()]*[^\s<>().,;:!?'"]/gi
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)\s?)?\d{3,4}[\s.-]\d{4}(?:[\s.-]\d{3,4})?\b/g

const ABBREVIATION = /\b(?:e\.g|i\.e|etc|vs|approx|dept|ext|no|nos|st|mr|mrs|ms|dr|prof|inc|ltd|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|a\.m|p\.m|u\.s|u\.k|min|max|fig|apt|rm|bldg)\.$/i

export function contactsIn(text: string): Contact[] {
  const out: Contact[] = []
  for (const e of text.match(EMAIL) ?? []) out.push({ kind: 'email', value: e })
  const withoutEmails = text.replace(EMAIL, ' ')
  for (const u of withoutEmails.match(URL) ?? []) out.push({ kind: 'link', value: u })
  const rest = withoutEmails.replace(URL, ' ')
  for (const p of rest.match(PHONE) ?? []) {
    const digits = p.replace(/\D/g, '')
    if (digits.length >= 7 && digits.length <= 15) out.push({ kind: 'phone', value: p.trim() })
  }
  return out
}

/** Splits a paragraph into sentences without breaking on "e.g.", "a.m.", "Dr." or initials. */
export function sentences(paragraph: string): string[] {
  const text = paragraph.replace(/\s+/g, ' ').trim()
  if (!text) return []
  const out: string[] = []
  let start = 0
  const re = /([.!?])(["')\]]*)\s+(?=["'(\[]?[A-Z0-9])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const end = m.index + m[1].length + m[2].length
    const piece = text.slice(start, end)
    if (m[1] === '.' && (ABBREVIATION.test(piece) || /(?:^|\s)[A-Z]\.$/.test(piece))) continue
    out.push(piece.trim())
    start = re.lastIndex
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out
}

export interface Unit {
  text: string
  listItem: boolean
  intro: string | null // the sentence that introduced the list this item belongs to
}

const BULLET = /^\s*(?:[-*•·◦▪–]|\(?\d{1,2}[.)]|\(?[a-z][.)]|step\s+\d+[:.)]?)\s+/i

/** Breaks the text into list items and sentences, remembering which sentence introduced each list. */
export function units(text: string): Unit[] {
  const out: Unit[] = []
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    let intro: string | null = null
    let para: string[] = []
    const flush = () => {
      for (const s of sentences(para.join(' '))) out.push({ text: s, listItem: false, intro: null })
      para = []
    }
    for (const raw of block.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      if (BULLET.test(line)) {
        if (para.length) {
          const prev = sentences(para.join(' '))
          for (const s of prev) out.push({ text: s, listItem: false, intro: null })
          para = []
          intro = prev[prev.length - 1] ?? null
        }
        out.push({ text: line.replace(BULLET, '').trim(), listItem: true, intro })
      } else if (out.length && out[out.length - 1].listItem && !para.length && /^[a-z(]/.test(line)) {
        out[out.length - 1].text += ' ' + line // a list item wrapped onto the next line
      } else {
        intro = null
        para.push(line)
      }
    }
    flush()
  }
  return out
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function tidy(s: string): string {
  return capitalize(s.replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim())
}

function firstWord(s: string): string {
  return (s.match(/^[A-Za-z][A-Za-z'-]*/)?.[0] ?? '').toLowerCase()
}

/** "You must submit your form by Friday." -> "Submit your form by Friday." Returns null when it is not an instruction. */
export function asInstruction(sentence: string): { text: string; condition: string | null } | null {
  let s = sentence.trim().replace(/^["'(]+/, '')
  let condition: string | null = null
  const cond = /^(if|unless|only if)\s+([^,]{3,90}),\s*(.+)$/i.exec(s)
  if (cond) {
    condition = capitalize(`${cond[1]} ${cond[2]}`)
    s = cond[3]
  }
  s = s.replace(LEAD_IN, '')
  if (/\?\s*$/.test(s) || READ_THIS.test(s)) return null
  if (REMINDER.test(s)) return { text: tidy(s.replace(/^please\s+/i, '')), condition }
  if (VERBS.has(firstWord(s))) return { text: tidy(s), condition }
  const ob = OBLIGATION.exec(s)
  if (ob && VERBS.has(ob[1].toLowerCase())) {
    let rest = s.slice(ob.index + ob[0].length - ob[1].length)
    if (!/^you\b/i.test(ob[0])) rest = rest.replace(/\btheir\b/g, 'your').replace(/\bthey\b/g, 'you') // "each student needs to submit their own copy"
    return { text: tidy(rest), condition }
  }
  const other = OTHER_OBLIGATION.exec(s)
  if (other && VERBS.has(other[1].toLowerCase())) return { text: tidy(s), condition }
  return null
}

function splitItems(list: string): string[] {
  return list
    .replace(/[.;]\s*$/, '')
    .split(/;|,(?![^()]*\))|\s(?:and|plus)\s(?![^()]*\))/)
    .map((x) => x.trim().replace(/^(?:and|or)\s+/i, ''))
    .filter((x) => x.length > 1 && x.length < 140)
    .map(capitalize)
}

export function untangle(text: string, ref: string): Untangled {
  const all_units = units(text)
  // An instruction that introduces a list of instructions ("Before Monday, please complete the following:") is a heading,
  // not a step of its own; its date passes to the items that have none.
  const headings = new Map<string, When | null>()
  for (const u of all_units) {
    if (u.listItem || !/:\s*$/.test(u.text) || READY_CUE.test(u.text) || !asInstruction(u.text)) continue
    const items = all_units.filter((x) => x.listItem && x.intro === u.text)
    if (items.length && items.filter((x) => asInstruction(x.text)).length * 2 >= items.length) headings.set(u.text, findWhen(u.text, ref))
  }
  const steps: Step[] = []
  const ready: Note[] = []
  const warnings: Note[] = []
  const background: string[] = []
  const dates: KeyDate[] = []
  const all: Contact[] = []
  let n = 0
  let afterQuestion = false
  for (const u of all_units) {
    const sentence = u.text
    if (headings.has(sentence)) {
      background.push(sentence)
      continue
    }
    const contacts = contactsIn(sentence)
    all.push(...contacts)
    const wasQuestion = afterQuestion
    afterQuestion = /\?\s*$/.test(sentence) && QUESTION_WORDS.test(sentence)

    if (u.listItem && u.intro && READY_CUE.test(u.intro)) {
      ready.push({ text: tidy(sentence.replace(/[.;]\s*$/, '')), original: `${u.intro} ${sentence}` })
      continue
    }
    // "You will need: your ID, a recent bill and your student number." (a colon that is not part of a time like 5:00)
    const inline = READY_CUE.exec(sentence)
    const colon = inline ? /(?<!\d):(?!\d)\s*\S/.exec(sentence.slice(inline.index)) : null
    if (inline && colon) {
      for (const item of splitItems(sentence.slice(inline.index + colon.index + 1))) ready.push({ text: item, original: sentence })
      continue
    }
    const contactOnly = contacts.length > 0 && (wasQuestion || /^(?:if you (?:have|need)[^,]*,|for (?:more )?(?:questions|help|information)[^,]*,)/i.test(sentence))
    const negative = NEGATIVE.test(sentence.replace(LEAD_IN, ''))
    let instruction = contactOnly || negative ? null : asInstruction(sentence)
    if (!instruction && u.listItem && u.intro && /:\s*$/.test(u.intro) && asInstruction(u.intro)) {
      instruction = { text: tidy(sentence.replace(/[.;]\s*$/, '')), condition: null }
    }
    const own = findWhen(sentence, ref)
    const inherited = u.listItem && u.intro ? headings.get(u.intro) ?? null : null
    const when = own ?? inherited
    if (!instruction && !negative && !contactOnly && DUE.test(sentence) && own?.date) instruction = { text: tidy(sentence), condition: null }
    if (instruction) {
      const id = `s${++n}`
      steps.push({ id, text: instruction.text, original: u.listItem && u.intro ? `${u.intro} ${sentence}` : sentence, when, condition: instruction.condition, contacts })
      if (when) dates.push({ when, text: sentence, stepId: id })
      // "Bring your passport, two photos and the printed confirmation." also fills the list of things to have ready.
      const bring = /^bring\s+(.+)$/i.exec(instruction.text)
      if (bring && !u.listItem) for (const item of splitItems(bring[1])) ready.push({ text: item, original: sentence })
      continue
    }
    if (when?.date) dates.push({ when, text: sentence, stepId: null })
    if (negative || (!contactOnly && WARNING_WORDS.test(sentence))) {
      warnings.push({ text: tidy(sentence.replace(/^please\s+/i, '')), original: sentence })
      continue
    }
    background.push(sentence)
  }
  const seen = new Set<string>()
  const contacts = all.filter((c) => {
    const key = `${c.kind}:${c.value.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  dates.sort((a, b) => (a.when.date ?? '9999').localeCompare(b.when.date ?? '9999') || (a.when.time ?? '').localeCompare(b.when.time ?? ''))
  return { steps, ready, warnings, dates, contacts, background }
}
