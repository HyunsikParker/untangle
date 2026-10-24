import { useEffect, useMemo, useRef, useState } from 'react'
import { isIsoDate, parseIso, type When } from './dates'
import { asText, buildIcs, datedSteps } from './ics'
import { qualifiedText, untangle, type Contact, type Step } from './parse'
import { samples } from './sample'
import { KEY, loadSaved, today, type Saved, type Settings } from './storage'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(date: string): string {
  const d = parseIso(date)
  return `${WEEKDAY[d.getUTCDay()]}, ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function timeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number)
  if (h === 23 && m === 59) return '11:59 pm'
  if (h === 12 && m === 0) return 'noon'
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`
}

function daysFrom(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86400000)
}

function whenText(w: When, now: string): string {
  if (!w.date) return w.time ? `${w.kind === 'deadline' ? 'By' : 'At'} ${timeLabel(w.time)}` : ''
  const n = daysFrom(now, w.date)
  const rel = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : n === -1 ? 'yesterday' : `${-n} days ago`
  return `${w.kind === 'deadline' ? 'Due' : 'On'} ${dayLabel(w.date)}${w.time ? `, ${timeLabel(w.time)}` : ''} · ${rel}`
}

function titleOf(text: string): string {
  const first = text.split(/\n/).map((l) => l.trim()).find((l) => l.length > 3) ?? 'Your checklist'
  return first.replace(/^subject:\s*/i, '').slice(0, 90)
}

function contactHref(c: Contact): string {
  if (c.kind === 'email') return `mailto:${c.value}`
  if (c.kind === 'phone') return `tel:${c.value.replace(/[^\d+]/g, '')}`
  return /^https?:/i.test(c.value) ? c.value : `https://${c.value}`
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export default function App() {
  const [initial] = useState(loadSaved)
  const [personal, setPersonal] = useState(initial.saved)
  const [example, setExample] = useState<Saved | null>(null)
  const [recovery, setRecovery] = useState(initial.recovery)
  const [saveError, setSaveError] = useState(false)
  const [retry, setRetry] = useState(0)
  const state = { ...(example ?? personal), settings: personal.settings }
  const setState = (change: (previous: Saved) => Saved) => {
    if (example) setExample((s) => s ? change(s) : s)
    else setPersonal(change)
  }
  const [focus, setFocus] = useState(false)
  const [note, setNote] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (recovery !== null || initial.readBlocked) return
    try {
      localStorage.setItem(KEY, JSON.stringify(personal))
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }, [personal, recovery, retry, initial.readBlocked])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.size = String(state.settings.size)
    root.dataset.relaxed = String(state.settings.relaxed)
    root.dataset.easy = String(state.settings.easyFont)
  }, [state.settings])

  const result = useMemo(() => untangle(state.text, state.received), [state.text, state.received])
  const title = titleOf(state.text)
  const done = new Set(result.steps.filter((s) => state.done.includes(s.original)).map((s) => s.id))
  const update = (patch: Partial<Saved>) => setState((s) => ({ ...s, ...patch }))
  const setSettings = (patch: Partial<Settings>) => setPersonal((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  const toggleDone = (step: Step, value: boolean) =>
    setState((s) => ({ ...s, done: value ? [...new Set([...s.done, step.original])] : s.done.filter((d) => d !== step.original) }))
  const toggleHave = (item: string, value: boolean) =>
    setState((s) => ({ ...s, have: value ? [...new Set([...s.have, item])] : s.have.filter((h) => h !== item) }))

  const editText = (text: string) => {
    const next = untangle(text, state.received)
    // Keep completion only while both the wording and its inherited conditions/dates stay the same.
    const unchanged = new Set(result.steps.filter((old) => next.steps.some((step) =>
      step.original === old.original && qualifiedText(step) === qualifiedText(old) && JSON.stringify(step.when) === JSON.stringify(old.when),
    )).map((step) => step.original))
    update({ text, done: state.done.filter((original) => unchanged.has(original)), have: state.have.filter((item) => next.ready.some((ready) => ready.text === item)) })
  }

  const run = () => {
    if (!state.text.trim()) {
      setNote('Paste some instructions first.')
      inputRef.current?.focus()
      return
    }
    setNote('')
    update({ view: 'list' })
    requestAnimationFrame(() => document.getElementById('list-title')?.focus())
  }

  const loadSample = (id: string) => {
    const s = samples(today()).find((x) => x.id === id)!
    setNote('')
    setExample({ ...personal, text: s.text, received: s.received, view: 'list', done: [], have: [] })
    requestAnimationFrame(() => document.getElementById('list-title')?.focus())
  }

  const returnToPersonal = () => {
    setExample(null)
    setFocus(false)
    setNote('')
    requestAnimationFrame(() => personal.view === 'input' ? inputRef.current?.focus() : document.getElementById('list-title')?.focus())
  }

  const saveFile = (content: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const downloadPersonal = () => {
    const parsed = untangle(personal.text, personal.received)
    const completed = new Set(parsed.steps.filter((s) => personal.done.includes(s.original)).map((s) => s.id))
    saveFile(`Received on: ${personal.received}\n\nOriginal instructions\n${personal.text}\n\n${asText(titleOf(personal.text), parsed.steps, completed, parsed.ready.map((r) => r.text), parsed.warnings.map((w) => w.text))}`, 'untangle-checklist.txt', 'text/plain;charset=utf-8')
  }

  const download = () => {
    const ics = buildIcs(result.steps, title)
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'untangle-dates.ics'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    const n = datedSteps(result.steps).length
    setNote(`Saved untangle-dates.ics with ${plural(n, 'dated step')}. Open it to add ${n === 1 ? 'it' : 'them'} to your calendar.`)
  }

  const copy = async () => {
    const text = asText(title, result.steps, done, result.ready.map((r) => r.text), result.warnings.map((w) => w.text))
    try {
      await navigator.clipboard.writeText(text)
      setNote('Checklist copied. Paste it into your notes or to-do app.')
    } catch {
      setNote('Copying is blocked in this browser. Select the steps and copy them by hand.')
    }
  }

  const { steps, ready, warnings, dates, contacts, background } = result
  const now = today() // "in 3 days" counts from today; relative words in the text count from the day it arrived
  const left = steps.filter((s) => !done.has(s.id)).length
  const nextDue = steps.filter((s) => s.when?.date && s.when.kind === 'deadline' && !done.has(s.id)).sort((a, b) => a.when!.date!.localeCompare(b.when!.date!))[0]

  return (
    <div className="app">
      <header className="top">
        <p className="brand"><span className="mark" aria-hidden="true" />Untangle</p>
        <ReadingSettings settings={state.settings} onChange={setSettings} />
      </header>

      {(recovery !== null || initial.readBlocked || saveError) && (
        <aside className="storage-notice" aria-label="Saving your checklist">
          <p role="alert">
            {recovery !== null
              ? 'Some saved data could not be read. The instructions we could recover are shown below. Check the received date and completed steps. Your original saved copy has not been changed. Download it before saving the recovered checklist.'
              : initial.readBlocked
                ? 'This browser could not open your saved checklist. You can work here, but changes will not be saved. Download your instructions before closing this page.'
                : 'Your latest changes could not be saved in this browser. Keep this page open and retry, or download your instructions before closing it.'}
          </p>
          <div className="actions">
            {recovery !== null && <>
              <button type="button" className="secondary" onClick={() => saveFile(recovery, 'untangle-saved-copy.json', 'application/json')}>Download saved copy</button>
              <button type="button" className="secondary" onClick={() => setRecovery(null)}>Save recovered checklist</button>
            </>}
            {saveError && <button type="button" className="secondary" onClick={() => setRetry((n) => n + 1)}>Retry saving</button>}
            {(saveError || initial.readBlocked) && <button type="button" className="secondary" onClick={downloadPersonal}>Download my instructions</button>}
          </div>
        </aside>
      )}
      {example && (
        <aside className="example-notice" aria-label="Example preview">
          <p>This is a made-up example. Your own instructions are kept separately. Example progress lasts until you leave this preview.</p>
          <button type="button" className="secondary" onClick={returnToPersonal}>Return to my instructions</button>
        </aside>
      )}

      {state.view === 'input' ? (
        <main className="input-view">
          <h1>Turn a wall of instructions into one clear step at a time</h1>
          <p className="lede">
            Paste an email, a letter or an assignment brief. Untangle pulls out what you have to do, by when, what to have
            ready and what to watch out for, then walks you through it one step at a time. <strong>Nothing leaves this
            device.</strong>
          </p>
          <div className="paste">
            <label htmlFor="source" className="field-label">Instructions</label>
            <textarea
              id="source"
              ref={inputRef}
              value={state.text}
              rows={12}
              placeholder="Paste the message here"
              onChange={(e) => editText(e.target.value)}
            />
            <div className="paste-row">
              <label className="date-field">
                <span>Received on</span>
                <input type="date" value={state.received} onChange={(e) => isIsoDate(e.target.value) && update({ received: e.target.value })} />
              </label>
              <p className="hint">Used for words like &ldquo;Friday&rdquo; or &ldquo;within 10 days&rdquo;.</p>
              <button type="button" className="primary big" onClick={run}>Untangle it</button>
            </div>
            {note && <p className="note" role="status">{note}</p>}
          </div>
          <section className="samples" aria-labelledby="samples-title">
            <h2 id="samples-title">Or try a made-up example</h2>
            <div className="sample-buttons">
              {samples(today()).map((s) => (
                <button key={s.id} type="button" className="secondary" onClick={() => loadSample(s.id)}>{s.label}</button>
              ))}
            </div>
          </section>
          <section className="how" aria-labelledby="how-title">
            <h2 id="how-title">How it reads a message</h2>
            <ul>
              <li><strong>Steps</strong> are sentences that ask you to do something (&ldquo;Submit&hellip;&rdquo;, &ldquo;You must&hellip;&rdquo;, &ldquo;Make sure&hellip;&rdquo;) and numbered or bulleted items.</li>
              <li><strong>Dates</strong> such as &ldquo;by Friday, November 6 at 5:00 p.m.&rdquo; or &ldquo;within 10 business days&rdquo; become due dates you can add to your calendar. A window that starts later (&ldquo;after you upload your documents&rdquo;) keeps its wording instead of a guessed date, and opening hours are not read as dates.</li>
              <li><strong>Things to have ready</strong> come from lines like &ldquo;You will need:&rdquo; or &ldquo;Bring&hellip;&rdquo;; <strong>warnings</strong> from &ldquo;do not&rdquo;, &ldquo;late&rdquo;, &ldquo;will not be accepted&rdquo; and similar.</li>
              <li>Every item keeps the original sentence, so you can always check the exact wording. It is a reading aid, not advice: if something matters, read the original.</li>
            </ul>
          </section>
        </main>
      ) : (
        <main className="list-view">
          <div className="list-head">
            <p className="eyebrow">Your checklist</p>
            <h1 id="list-title" tabIndex={-1}>{title}</h1>
            <p className="summary">
              {plural(steps.length, 'step')}
              {nextDue && <> · next due {dayLabel(nextDue.when!.date!)} ({whenText(nextDue.when!, now).split(' · ')[1]})</>}
              {ready.length > 0 && <> · {plural(ready.length, 'thing')} to have ready</>}
              {warnings.length > 0 && <> · {plural(warnings.length, 'warning')}</>}
            </p>
            <div className="actions">
              <button type="button" className="primary big" onClick={() => setFocus(true)} disabled={!steps.length}>
                {left < steps.length && left > 0 ? `Continue: ${left} left` : 'Start one step at a time'}
              </button>
              <button type="button" className="secondary" onClick={download} disabled={!datedSteps(steps).length}>Add dates to calendar</button>
              <button type="button" className="secondary" onClick={() => void copy()} disabled={!steps.length}>Copy as checklist</button>
              <button type="button" className="link" onClick={() => update({ view: 'input' })}>Edit or paste new text</button>
            </div>
            {note && <p className="note" role="status">{note}</p>}
          </div>

          {!steps.length && (
            <p className="empty">No steps found. Untangle looks for sentences that ask you to do something, such as &ldquo;Submit the form&rdquo; or &ldquo;You must sign&hellip;&rdquo;. Check that you pasted the whole message.</p>
          )}

          {(ready.length > 0 || warnings.length > 0) && (
            <div className="prep">
              {ready.length > 0 && (
                <section className="card ready" aria-labelledby="ready-title">
                  <h2 id="ready-title">Have ready</h2>
                  <ul className="checks">
                    {ready.map((r) => (
                      <li key={r.text}>
                        <label>
                          <input type="checkbox" checked={state.have.includes(r.text)} onChange={(e) => toggleHave(r.text, e.target.checked)} />
                          <span>{r.text}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {warnings.length > 0 && (
                <section className="card warn" aria-labelledby="warn-title">
                  <h2 id="warn-title"><span className="warn-icon" aria-hidden="true">!</span>Watch out</h2>
                  <ul>{warnings.map((w) => <li key={w.text}>{w.text}</li>)}</ul>
                </section>
              )}
            </div>
          )}

          {steps.length > 0 && (
            <section aria-labelledby="steps-title">
              <h2 id="steps-title" className="section-title">Steps</h2>
              <ol className="steps">
                {steps.map((s, k) => (
                  <StepItem key={s.id} step={s} n={k + 1} done={done.has(s.id)} now={now} onDone={(v) => toggleDone(s, v)} />
                ))}
              </ol>
            </section>
          )}

          {dates.length > 0 && (
            <section aria-labelledby="dates-title">
              <h2 id="dates-title" className="section-title">Dates in this message</h2>
              <ul className="dates">
                {dates.map((d, k) => (
                  <li key={k}>
                    <span className="date-chip">{d.when.date ? dayLabel(d.when.date) : ''}{d.when.time ? `, ${timeLabel(d.when.time)}` : ''}</span>
                    <span>{d.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {contacts.length > 0 && (
            <section aria-labelledby="contacts-title">
              <h2 id="contacts-title" className="section-title">Contacts and links</h2>
              <ul className="contacts">
                {contacts.map((c) => (
                  <li key={c.value}><span className="contact-kind">{c.kind === 'email' ? 'Email' : c.kind === 'phone' ? 'Phone' : 'Link'}</span> <a href={contactHref(c)} rel="noreferrer noopener" target={c.kind === 'link' ? '_blank' : undefined}>{c.value}</a></li>
                ))}
              </ul>
            </section>
          )}

          {background.length > 0 && (
            <details className="background">
              <summary>The rest of the message ({plural(background.length, 'sentence')})</summary>
              <ul>{background.map((b, k) => <li key={k}>{b}</li>)}</ul>
            </details>
          )}

          {focus && (
            <FocusMode
              steps={steps}
              ready={ready.map((r) => r.text)}
              warnings={warnings.map((w) => w.text)}
              done={done}
              now={now}
              onDone={(s, v) => toggleDone(s, v)}
              onClose={() => setFocus(false)}
            />
          )}
        </main>
      )}

      <footer className="footer">
        <p>Untangle runs entirely in your browser: nothing you paste is uploaded, and the page cannot make network requests. Your own text and progress are saved here when browser storage is available. {!example && <button type="button" className="link small" onClick={() => { setPersonal((s) => ({ ...s, text: '', view: 'input', done: [], have: [] })); setRecovery(null); setNote('') }}>Clear my text</button>}</p>
      </footer>
    </div>
  )
}

function StepItem({ step, n, done, now, onDone }: { step: Step; n: number; done: boolean; now: string; onDone: (v: boolean) => void }) {
  const [showOriginal, setShowOriginal] = useState(false)
  const id = `step-${step.id}`
  const overdue = step.when?.date && step.when.kind === 'deadline' && daysFrom(now, step.when.date) < 0
  return (
    <li className={`step${done ? ' is-done' : ''}`}>
      <input type="checkbox" id={id} checked={done} onChange={(e) => onDone(e.target.checked)} />
      <div className="step-body">
        <label htmlFor={id} className="step-text"><span className="step-n">{n}.</span> {step.text}</label>
        <div className="step-meta">
          {step.when && (step.when.date || step.when.time) && (
            <span className={`badge ${step.when.kind}${overdue ? ' overdue' : ''}`}>{whenText(step.when, now)}</span>
          )}
          {step.condition && <span className="badge condition">{step.condition}</span>}
          {step.contacts.map((c) => (
            <a key={c.value} className="badge contact" href={contactHref(c)} rel="noreferrer noopener" target={c.kind === 'link' ? '_blank' : undefined}>{c.value}</a>
          ))}
        </div>
        <button type="button" className="link small" aria-expanded={showOriginal} onClick={() => setShowOriginal(!showOriginal)}>
          {showOriginal ? 'Hide original wording' : 'Original wording'}
        </button>
        {showOriginal && <blockquote className="original">{step.original}</blockquote>}
      </div>
    </li>
  )
}

function ReadingSettings({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  return (
    <div className="reading" role="group" aria-label="Reading settings">
      <span className="reading-label">Text</span>
      <button type="button" className="tool" onClick={() => onChange({ size: Math.max(0, settings.size - 1) as Settings['size'] })} disabled={settings.size === 0}>Smaller</button>
      <button type="button" className="tool" onClick={() => onChange({ size: Math.min(3, settings.size + 1) as Settings['size'] })} disabled={settings.size === 3}>Larger</button>
      <button type="button" className="tool" aria-pressed={settings.relaxed} onClick={() => onChange({ relaxed: !settings.relaxed })}>Wide spacing</button>
      <button type="button" className="tool" aria-pressed={settings.easyFont} onClick={() => onChange({ easyFont: !settings.easyFont })}>Easy-read font</button>
    </div>
  )
}

function FocusMode({ steps, ready, warnings, done, now, onDone, onClose }: {
  steps: Step[]
  ready: string[]
  warnings: string[]
  done: Set<string>
  now: string
  onDone: (s: Step, v: boolean) => void
  onClose: () => void
}) {
  const hasPrep = ready.length > 0 || warnings.length > 0
  const firstOpen = steps.findIndex((s) => !done.has(s.id))
  const [pos, setPos] = useState(firstOpen > 0 ? firstOpen + (hasPrep ? 1 : 0) : 0) // position 0 is the "before you start" card when there is one
  const [skipped, setSkipped] = useState<string[]>([])
  const [timer, setTimer] = useState<number | null>(null)
  const [announce, setAnnounce] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const dialog = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const total = steps.length
  const index = pos - (hasPrep ? 1 : 0) // index into steps, -1 = prep card, total = finished
  const step = index >= 0 && index < total ? steps[index] : null
  const finished = index >= total

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    return () => previous?.focus()
  }, [])
  useEffect(() => {
    heading.current?.focus()
  }, [pos])
  useEffect(() => {
    // Only voices that run on this device, so read-aloud text is not sent to an online speech service.
    if (typeof speechSynthesis === 'undefined') return
    const pick = () => setVoices(speechSynthesis.getVoices().filter((v) => v.localService && v.lang.startsWith('en')))
    pick()
    speechSynthesis.addEventListener('voiceschanged', pick)
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', pick)
      speechSynthesis.cancel()
    }
  }, [])
  useEffect(() => {
    if (timer === null) return
    if (timer <= 0) {
      setAnnounce('Ten minutes are up. Take a short break or keep going.')
      setTimer(null)
      return
    }
    const t = setTimeout(() => setTimer(timer - 1), 1000)
    return () => clearTimeout(t)
  }, [timer])

  const next = () => setPos((p) => Math.min(p + 1, total + (hasPrep ? 1 : 0)))
  const back = () => setPos((p) => Math.max(0, p - 1))
  const markDone = () => {
    if (!step) return next()
    onDone(step, true)
    setSkipped((s) => s.filter((x) => x !== step.id))
    setAnnounce(`Step ${index + 1} done.`)
    next()
  }
  const skip = () => {
    if (step) setSkipped((s) => [...new Set([...s, step.id])])
    next()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onClose()
    const tag = (e.target as HTMLElement).tagName
    if (['BUTTON', 'A', 'SUMMARY'].includes(tag) && (e.key === 'Enter' || e.key === ' ')) return
    if (e.key === 'Enter' && !finished) { e.preventDefault(); markDone() }
    if (e.key === 'ArrowRight') { e.preventDefault(); next() }
    if (e.key === 'ArrowLeft') { e.preventDefault(); back() }
    if (e.key === 'Tab') {
      const items = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')
      if (!items?.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }
  const speak = (text: string) => {
    if (!voices.length) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voices[0]
    speechSynthesis.speak(u)
  }
  const doneCount = steps.filter((s) => done.has(s.id)).length
  const remaining = steps.filter((s) => !done.has(s.id))

  return (
    <div className="focus-backdrop">
      <div className="focus" role="dialog" aria-modal="true" aria-labelledby="focus-heading" ref={dialog} onKeyDown={onKey}>
        <div className="focus-top">
          <p className="focus-progress">{finished ? 'Finished' : step ? `Step ${index + 1} of ${total}` : 'Before you start'}</p>
          <div className="meter" aria-hidden="true"><span className={`fill w${Math.round((doneCount / Math.max(1, total)) * 20)}`} /></div>
          <button type="button" className="link" onClick={onClose}>Close <span className="key">Esc</span></button>
        </div>

        {!step && !finished && (
          <div className="focus-card">
            <h2 id="focus-heading" ref={heading} tabIndex={-1}>Before you start</h2>
            {ready.length > 0 && (<><h3>Have these ready</h3><ul>{ready.map((r) => <li key={r}>{r}</li>)}</ul></>)}
            {warnings.length > 0 && (<><h3>Watch out</h3><ul className="focus-warn">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></>)}
          </div>
        )}

        {step && (
          <div className="focus-card">
            <h2 id="focus-heading" ref={heading} tabIndex={-1} className="focus-step">{step.text}</h2>
            <div className="step-meta">
              {step.when && (step.when.date || step.when.time) && <span className={`badge ${step.when.kind}`}>{whenText(step.when, now)}</span>}
              {step.condition && <span className="badge condition">{step.condition}</span>}
              {step.contacts.map((c) => <a key={c.value} className="badge contact" href={contactHref(c)} rel="noreferrer noopener" target={c.kind === 'link' ? '_blank' : undefined}>{c.value}</a>)}
            </div>
            {done.has(step.id) && <p className="already">Already marked done.</p>}
            <details className="focus-original"><summary>Original wording</summary><blockquote>{step.original}</blockquote></details>
          </div>
        )}

        {finished && (
          <div className="focus-card">
            <h2 id="focus-heading" ref={heading} tabIndex={-1}>{remaining.length ? `${plural(doneCount, 'step')} done, ${remaining.length} to come back to` : 'Every step is done'}</h2>
            {remaining.length > 0 ? (
              <ul>{remaining.map((s) => <li key={s.id}>{qualifiedText(s)}{s.when?.date ? ` (${whenText(s.when, now).split(' · ')[0]})` : ''}</li>)}</ul>
            ) : (
              <p>Nice work. Keep the original message until the last date has passed.</p>
            )}
          </div>
        )}

        <div className="focus-actions">
          <button type="button" className="secondary" onClick={back} disabled={pos === 0}>Back</button>
          {step && <button type="button" className="secondary" onClick={skip}>Skip for now</button>}
          {!finished && <button type="button" className="primary big" onClick={markDone}>{step ? 'Done' : 'Start'}</button>}
          {finished && <button type="button" className="primary big" onClick={onClose}>Back to the checklist</button>}
        </div>
        <div className="focus-tools">
          {step && voices.length > 0 && <button type="button" className="link small" onClick={() => speak(qualifiedText(step))}>Read aloud</button>}
          <button type="button" className="link small" onClick={() => setTimer(timer === null ? 600 : null)}>
            {timer === null ? 'Start a 10-minute focus timer' : `Stop timer (${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, '0')} left)`}
          </button>
          <p className="keys" aria-hidden="true">Keys: <span className="key">Enter</span> done, <span className="key">←</span> back, <span className="key">→</span> next, <span className="key">Esc</span> close</p>
        </div>
        <p className="sr-only" aria-live="polite">{announce}</p>
      </div>
    </div>
  )
}

