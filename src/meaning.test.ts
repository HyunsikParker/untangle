import { describe, expect, it } from 'vitest'
import { findWhen } from './dates'
import { asInstruction, untangle } from './parse'
import { buildIcs } from './ics'

const REF = '2026-10-26'

describe('qualifications survive a checklist and its calendar', () => {
  it('keeps a list heading condition attached to each task', () => {
    const result = untangle('Only if you received an offer, complete the following by Friday:\n- Sign the agreement.\n- Upload your ID.', REF)
    expect(result.steps).toHaveLength(2)
    expect(result.steps.map((s) => s.condition)).toEqual(['Only if you received an offer', 'Only if you received an offer'])
    expect(result.steps.every((s) => s.when?.date === '2026-10-30')).toBe(true)
  })

  it('retains an exception before an obligation rather than issuing an unconditional task', () => {
    expect(asInstruction('For students who received an offer, you must sign the agreement.')?.text)
      .toBe('For students who received an offer, you must sign the agreement.')
  })

  it('does not turn a list prohibition into an affirmative checklist item', () => {
    const result = untangle('Complete the following:\n- Sign the agreement.\n- Do not send a passport by email.', REF)
    expect(result.steps.map((s) => s.text)).toEqual(['Sign the agreement.'])
    expect(result.warnings.map((s) => s.text)).toEqual(['Do not send a passport by email.'])
  })

  it('keeps eligibility in the calendar summary and reminder, not only the description', () => {
    const result = untangle('If you received an offer, sign the agreement by Friday.', REF)
    const ics = buildIcs(result.steps, 'Application').replace(/\r\n /g, '')
    expect(ics).toContain('SUMMARY:Due: If you received an offer: Sign the agreement by Friday.')
    expect(ics).toContain('ACTION:DISPLAY\r\nDESCRIPTION:If you received an offer: Sign the agreement by Friday.')
  })

  it('keeps both a heading qualification and an item exception', () => {
    const result = untangle('Only if you received an offer, complete the following:\n- Unless you already signed, sign the agreement by Friday.', REF)
    expect(result.steps[0].condition).toBe('Only if you received an offer; Unless you already signed')
    expect(result.steps[0].original).toContain('Only if you received an offer')
  })

  it.each(['If you received an offer, do not email your ID.', 'You must not email your ID.', 'Next, never email your ID.'])(
    'keeps a prohibition out of checklist steps: %s', (sentence) => {
      const result = untangle(`Complete the following:\n- Sign the agreement.\n- ${sentence}`, REF)
      expect(result.steps).toHaveLength(1)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0].original).toBe(`Complete the following: ${sentence}`)
    },
  )
})

describe('a calendar deadline uses the time that belongs to it', () => {
  it('does not borrow an earlier reminder time', () => {
    expect(findWhen('Read the 9 am reminder and submit by Friday at 5 pm.', REF))
      .toMatchObject({ date: '2026-10-30', time: '17:00', kind: 'deadline' })
  })

  it('chooses the explicit deadline instead of a preceding reference date', () => {
    expect(findWhen('Read the notes from Monday, then submit by Friday at 5 pm.', REF))
      .toMatchObject({ date: '2026-10-30', time: '17:00', kind: 'deadline' })
  })

  it('rejects an invalid clock minute instead of exporting an invalid calendar time', () => {
    expect(findWhen('Submit the form by November 6 at 5:90 pm.', REF)?.time).toBeNull()
  })

  it('does not borrow a time from an unrelated clause when the deadline has no time', () => {
    expect(findWhen('Read the 9 am reminder and submit by Friday.', REF))
      .toMatchObject({ date: '2026-10-30', time: null, label: 'by Friday' })
  })

  it('keeps a time-first deadline together when an earlier time is mentioned', () => {
    expect(findWhen('Read the 9 am reminder and submit by 5 p.m. on Friday.', REF))
      .toMatchObject({ date: '2026-10-30', time: '17:00', kind: 'deadline', label: 'by 5 p.m. on Friday' })
  })

  it.each(['5:60 pm', '13:00 pm', '25:00', '99:30', '0:00 am'])(
    'does not reinterpret an invalid clock as a smaller valid time: %s', (clock) => {
      expect(findWhen(`Submit by Friday at ${clock}.`, REF)?.time).toBeNull()
    },
  )
})
