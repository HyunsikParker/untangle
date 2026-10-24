import { describe, expect, it } from 'vitest'
import { decodeSaved, freshSaved } from './storage'

describe('recovering browser storage', () => {
  it('round-trips a complete saved checklist and reading preferences', () => {
    const saved = { ...freshSaved(), text: 'Submit the form.', received: '2026-10-26', view: 'list', done: ['Submit the form.'], have: ['ID'], settings: { size: 3, relaxed: true, easyFont: true } }
    expect(decodeSaved(JSON.stringify(saved))).toEqual({ saved, recovery: null, readBlocked: false })
  })

  it.each(['null', '42', '[]', '"old format"', '{broken'])('keeps the original %s for download instead of accepting an invalid object', (raw) => {
    const result = decodeSaved(raw)
    expect(result.recovery).toBe(raw)
    expect(result.saved.text).toBe('')
    expect(result.saved.done).toEqual([])
    expect(result.saved.view).toBe('input')
  })

  it('recovers valid instructions and preferences without trusting wrong field types', () => {
    const raw = JSON.stringify({ text: 'Submit the form.', received: '2026-10-26', view: 'list', done: null, have: [false], settings: { size: -1, relaxed: 'false', easyFont: true } })
    expect(decodeSaved(raw)).toEqual({
      saved: { text: 'Submit the form.', received: '2026-10-26', view: 'list', done: [], have: [], settings: { size: 1, relaxed: false, easyFont: true } },
      recovery: raw, readBlocked: false,
    })
  })

  it('opens the editor when the reference date is invalid so it can be checked', () => {
    const raw = JSON.stringify({ ...freshSaved(), text: 'Submit within 10 days.', received: '2026-02-30', view: 'list' })
    expect(decodeSaved(raw).recovery).toBe(raw)
    expect(decodeSaved(raw).saved.view).toBe('input')
  })
})
