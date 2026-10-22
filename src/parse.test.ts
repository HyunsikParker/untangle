import { describe, expect, it } from 'vitest'
import { findDates, findWhen } from './dates'
import { asInstruction, contactsIn, sentences, untangle, units } from './parse'
import { samples } from './sample'

const REF = '2026-10-26' // a Monday
// The samples are dated relative to the day they open; these days reproduce the dates the expectations use.
const OPENED: Record<string, string> = { aid: '2026-10-26', moveout: '2026-11-16', lab: '2026-10-19' }
const sample = (id: string) => samples(OPENED[id]).find((s) => s.id === id)!

describe('dates', () => {
  it('resolves relative words against the day the message arrived', () => {
    const d = (t: string) => findDates(t, REF).map((h) => h.date)
    expect(d('Reply by Friday')).toEqual(['2026-10-30'])
    expect(d('Come in tomorrow')).toEqual(['2026-10-27'])
    expect(d('Check your email within 10 business days')).toEqual(['2026-11-09'])
    expect(d('within 14 days')).toEqual(['2026-11-09'])
    expect(d('by the end of the month')).toEqual(['2026-10-31'])
    expect(d('Due Friday, November 6')).toEqual(['2026-11-06'])
    expect(d('on 3 December')).toEqual(['2026-12-03'])
    expect(d('before 1/15')).toEqual(['2027-01-15'])
    expect(d('Write a 1/2 page summary')).toEqual([])
  })

  it('leaves out opening hours and windows that start from a later event', () => {
    const d = (t: string) => findDates(t, REF).map((h) => h.date)
    expect(d('Call us Monday to Friday, 9 a.m. to 4 p.m.')).toEqual([])
    expect(d('The office is open Mon-Fri and every Saturday.')).toEqual([])
    expect(d('After you upload your documents, check your email within 10 business days.')).toEqual([])
    expect(d('Your deposit is returned within 30 days of your move-out.')).toEqual([])
    expect(d('Reply within 10 days of receiving this letter.')).toEqual(['2026-11-05'])
    expect(d('Reply by Friday; the office is closed Monday through Wednesday.')).toEqual(['2026-10-30'])
  })

  it('finds a deadline with its time and tells deadlines from appointments', () => {
    const w = findWhen('Submit it by 11:59 p.m. on Thursday, October 29.', '2026-10-19')!
    expect([w.date, w.time, w.kind]).toEqual(['2026-10-29', '23:59', 'deadline'])
    const a = findWhen('Your interview is on Tuesday, November 3 at 10 a.m.', REF)!
    expect([a.date, a.time, a.kind]).toEqual(['2026-11-03', '10:00', 'on'])
    expect(findWhen('Return the keys by 12:00 noon on December 20.', REF)?.time).toBe('12:00')
  })
})

describe('reading sentences', () => {
  it('does not split on abbreviations or initials', () => {
    expect(sentences('Email Dr. Okafor before 5 p.m. on Friday. Then wait, e.g. a day. J. Smith will reply.')).toEqual([
      'Email Dr. Okafor before 5 p.m. on Friday.',
      'Then wait, e.g. a day.',
      'J. Smith will reply.',
    ])
  })

  it('keeps list items and the sentence that introduced them', () => {
    const u = units('Bring the following:\n- your ID\n- a pen that\n  works\n\nThanks.')
    expect(u.map((x) => [x.text, x.listItem, x.intro])).toEqual([
      ['Bring the following:', false, null],
      ['your ID', true, 'Bring the following:'],
      ['a pen that works', true, 'Bring the following:'],
      ['Thanks.', false, null],
    ])
  })

  it('rewrites obligations as instructions and keeps conditions', () => {
    expect(asInstruction('You must submit your transcript by Friday.')?.text).toBe('Submit your transcript by Friday.')
    expect(asInstruction('Students are required to also attend one session.')?.text).toBe('Attend one session.')
    expect(asInstruction('Please complete the form.')?.text).toBe('Complete the form.')
    expect(asInstruction('Next, pay the fee online.')?.text).toBe('Pay the fee online.')
    expect(asInstruction('If you rent, upload your lease.')).toEqual({ text: 'Upload your lease.', condition: 'If you rent' })
    expect(asInstruction('After you upload your documents, check your email.')?.text).toBe('After you upload your documents, check your email.')
    expect(asInstruction('Then, once the form is signed, you must scan it.')?.text).toBe('Once the form is signed, scan it.')
    expect(asInstruction('To finish, return the keys.')?.text).toBe('Return the keys.')
    expect(asInstruction('Make sure every page is readable.')?.text).toBe('Make sure every page is readable.')
    expect(asInstruction('Your application has been selected.')).toBeNull()
    expect(asInstruction('Please read this whole message.')).toBeNull()
    expect(asInstruction('Questions about the form?')).toBeNull()
  })

  it('finds emails, links and phone numbers', () => {
    expect(contactsIn('Write to finaid@northfield.example, visit portal.northfield.example/verify or call 555-0142.')).toEqual([
      { kind: 'email', value: 'finaid@northfield.example' },
      { kind: 'link', value: 'portal.northfield.example/verify' },
      { kind: 'phone', value: '555-0142' },
    ])
  })
})

describe('untangle', () => {
  it('turns the financial aid email into steps, things to have ready and warnings', () => {
    const r = untangle(sample('aid').text, sample('aid').received)
    expect(r.steps.map((s) => s.text)).toEqual([
      'Submit the following documents through the Student Portal (portal.northfield.example/verify) by Friday, November 6 at 5:00 p.m.',
      'One of your parents must also sign the worksheet.',
      'Make sure every page is readable and that your student ID number is written at the top of each page.',
      'After you upload your documents, check your Northfield email within 10 business days, because we may ask for more information.',
    ])
    expect(r.steps[0].when).toMatchObject({ date: '2026-11-06', time: '17:00', kind: 'deadline' })
    expect(r.steps[1].condition).toBe('If you are a dependent student')
    expect(r.steps[3].when).toBeNull() // counts from the upload, not from the day the email arrived
    expect(r.dates.map((x) => x.when.date)).toEqual(['2026-11-06'])
    expect(r.ready.map((x) => x.text)).toEqual([
      'A signed copy of the 2027-28 Verification Worksheet',
      'Your 2025 IRS tax return transcript (not the full tax return)',
      'Proof of high school completion, if we do not already have it on file',
    ])
    expect(r.warnings.map((w) => w.text)).toEqual([
      'This is a routine review, but your aid cannot be paid until it is complete.',
      'Do not email documents; we cannot accept them by email for privacy reasons.',
      'Late documents may delay your aid until the spring term, and your housing deposit will not be refunded if your aid is cancelled.',
    ])
    expect(r.contacts.map((c) => c.value)).toEqual(['portal.northfield.example/verify', 'finaid@northfield.example', '555-0142'])
    expect(r.background.some((b) => b.startsWith('If you have questions'))).toBe(true)
  })

  it('reads a numbered move-out letter', () => {
    const r = untangle(sample('moveout').text, sample('moveout').received)
    expect(r.steps.map((s) => s.text.split(' ').slice(0, 2).join(' '))).toEqual(['Give us', 'Book a', 'Defrost and', 'Remove all', 'Return both'])
    expect(r.steps[4].when).toMatchObject({ date: '2026-12-20', time: '12:00', kind: 'deadline' })
    expect(r.ready.map((x) => x.text)).toEqual(['Your lease number', 'The inspection confirmation email', 'A photo ID'])
    expect(r.warnings).toHaveLength(2)
    expect(r.dates.map((d) => d.when.date)).toEqual(['2026-12-01', '2026-12-20', '2026-12-20'])
    expect(r.dates.find((d) => d.stepId === null)?.text).toBe('Your lease ends on Sunday, December 20.')
    expect(r.background).toContain('Write to office@aldercourt.example.')
  })

  it('reads a lab report brief', () => {
    const r = untangle(sample('lab').text, sample('lab').received)
    expect(r.steps.map((s) => s.text.split(' ')[0])).toEqual(['Write', 'Use', 'Your', 'All', 'Cite', 'Email'])
    expect(r.steps[1].when).toMatchObject({ date: '2026-10-29', time: '23:59', kind: 'deadline' })
    expect(r.steps[3].text).toBe('All figures must have labelled axes and units.')
    expect(r.steps[5]).toMatchObject({ condition: 'If you missed the lab session', when: { date: '2026-10-22', kind: 'deadline' } })
    expect(r.warnings.map((w) => w.text)).toEqual(['Late reports lose 10% of the mark per day.'])
  })
})

describe('other kinds of instructions', () => {
  it('treats an instruction that introduces a list as a heading and passes its date on', () => {
    const r = untangle([
      'Before your first day on Monday, please complete the following:',
      '1) Sign your offer letter in DocuSign.',
      '2) Fill out the I-9 form and bring two forms of ID on day one.',
      "3) Set up your laptop: you'll receive it by courier on Friday.",
      'Parking is not provided, so plan to take the bus.',
    ].join('\n'), REF)
    expect(r.steps.map((s) => s.text)).toEqual([
      'Sign your offer letter in DocuSign.',
      'Fill out the I-9 form and bring two forms of ID on day one.',
      "Set up your laptop: you'll receive it by courier on Friday.",
    ])
    expect(r.steps[0].when).toMatchObject({ date: '2026-11-02', kind: 'deadline' })
    expect(r.steps[2].when).toMatchObject({ date: '2026-10-30', kind: 'on' }) // "by courier" is not a deadline
    expect(r.warnings.map((w) => w.text)).toEqual(['Parking is not provided, so plan to take the bus.'])
  })

  it('turns a stated due date into a step and fills the list of things to bring', () => {
    const r = untangle('Submissions are due Sunday at midnight via the portal. Bring your passport, two recent photos and the printed confirmation. Each student needs to submit their own copy.', REF)
    expect(r.steps.map((s) => s.text)).toEqual([
      'Submissions are due Sunday at midnight via the portal.',
      'Bring your passport, two recent photos and the printed confirmation.',
      'Submit your own copy.',
    ])
    expect(r.steps[0].when).toMatchObject({ date: '2026-11-01', time: '23:59', kind: 'deadline' })
    expect(r.ready.map((x) => x.text)).toEqual(['Your passport', 'Two recent photos', 'The printed confirmation'])
  })
})
