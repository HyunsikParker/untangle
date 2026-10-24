import { isIsoDate } from './dates'

export interface Settings {
  size: 0 | 1 | 2 | 3
  relaxed: boolean
  easyFont: boolean
}

export interface Saved {
  text: string
  received: string
  view: 'input' | 'list'
  done: string[]
  have: string[]
  settings: Settings
}

export const KEY = 'untangle.v1'
export interface Loaded {
  saved: Saved
  recovery: string | null
  readBlocked: boolean
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function freshSaved(): Saved {
  return { text: '', received: today(), view: 'input', done: [], have: [], settings: { size: 1, relaxed: false, easyFont: false } }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function decodeSaved(raw: string | null): Loaded {
  const fresh = freshSaved()
  if (raw === null) return { saved: fresh, recovery: null, readBlocked: false }
  try {
    const value = record(JSON.parse(raw))
    let damaged = false
    const field = <T,>(value: unknown, valid: (v: unknown) => v is T, fallback: T): T => {
      if (valid(value)) return value
      damaged = true
      return fallback
    }
    const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')
    const boolean = (v: unknown): v is boolean => typeof v === 'boolean'
    const settings = record(value.settings)
    const saved: Saved = {
      text: field(value.text, (v): v is string => typeof v === 'string', ''),
      received: field(value.received, (v): v is string => typeof v === 'string' && isIsoDate(v), fresh.received),
      view: field(value.view, (v): v is Saved['view'] => v === 'input' || v === 'list', 'input'),
      done: field(value.done, strings, []),
      have: field(value.have, strings, []),
      settings: {
        size: field(settings.size, (v): v is Settings['size'] => v === 0 || v === 1 || v === 2 || v === 3, 1),
        relaxed: field(settings.relaxed, boolean, false),
        easyFont: field(settings.easyFont, boolean, false),
      },
    }
    if (!saved.text.trim() || !isIsoDate(typeof value.received === 'string' ? value.received : '')) saved.view = 'input'
    return { saved, recovery: damaged ? raw : null, readBlocked: false }
  } catch {
    return { saved: fresh, recovery: raw, readBlocked: false }
  }
}

export function loadSaved(): Loaded {
  try {
    return decodeSaved(localStorage.getItem(KEY))
  } catch {
    return { saved: freshSaved(), recovery: null, readBlocked: true }
  }
}
