// Records the narrated walkthrough: node scripts/demo.mjs https://hyunsikparker.github.io/untangle/ OUT_DIR
// then, from the Bounty tools: calibrate.py OUT_DIR/timeline.json --visual 2,3,4,5,6 and compose.py OUT_DIR/timeline.json OUT.mp4
// Every number in the narration is read off the financial aid example; the run stops if the page says otherwise.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [url, out] = process.argv.slice(2)
const TTS = '/Volumes/Crucial X9/workstation/Bounty/tts-narration/bin/bounty-tts'
mkdirSync(join(out, 'rec'), { recursive: true })

const scenes = [
  {
    text: 'Untangle turns a long email, letter or assignment brief into a checklist you can work through one step at a time. This is a made-up financial aid email, the kind of message that is easy to misread.',
    run: async (page) => {
      await page.waitForTimeout(6500)
      await page.getByLabel('Instructions').evaluate((el) => el.scrollTo({ top: 260, behavior: 'smooth' }))
    },
  },
  {
    text: 'Press Untangle it, and the email becomes four steps, three documents to have ready, and three warnings. It all happens in your browser; nothing you paste is sent anywhere.',
    check: [['.summary', '4 steps'], ['.summary', '3 things to have ready · 3 warnings']],
    run: async (page) => { await page.getByRole('button', { name: 'Untangle it' }).click() },
  },
  {
    text: 'Each step is a short instruction with its due date and any condition, and the exact original sentence is one click away. A window that counts from something you have not done yet, like this one, keeps its wording instead of a guessed date.',
    run: async (page) => {
      await scrollTo(page, '#steps-title')
      await page.waitForTimeout(7000)
      await page.locator('.steps > li').nth(3).getByRole('button', { name: 'Original wording' }).click()
    },
  },
  {
    text: 'Focus mode shows one step per screen in large type, starting with what to have ready. Done, Skip for now and Back work with the mouse, or with Enter and the arrow keys.',
    run: async (page) => {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await page.waitForTimeout(600)
      await page.getByRole('button', { name: 'Start one step at a time' }).click()
      await page.waitForTimeout(5000)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(3500)
      await page.keyboard.press('Enter')
    },
  },
  {
    text: 'Larger text, wider spacing and an easy-read font apply to the whole page, and your progress stays on this device.',
    run: async (page) => {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(1200)
      await page.getByRole('button', { name: 'Larger' }).click()
      await page.waitForTimeout(1200)
      await page.getByRole('button', { name: 'Wide spacing' }).click()
      await page.waitForTimeout(1200)
      await page.getByRole('button', { name: 'Easy-read font' }).click()
    },
  },
  {
    text: 'Finally, the dated steps go to your calendar with reminders, or the whole checklist can be copied as plain text.',
    run: async (page) => {
      await page.getByRole('button', { name: 'Easy-read font' }).click()
      await page.getByRole('button', { name: 'Wide spacing' }).click()
      await page.getByRole('button', { name: 'Smaller' }).click()
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: 'Add dates to calendar' }).click()
    },
  },
]

const scrollTo = (page, sel, block = 'start') =>
  page.evaluate(([s, b]) => document.querySelector(s).scrollIntoView({ behavior: 'smooth', block: b }), [sel, block])

// 1. Narration, one WAV per scene, reused while the scene text is unchanged.
scenes.forEach((s, k) => {
  s.wav = `s${k + 1}.wav`
  const receiptPath = join(out, `s${k + 1}.json`)
  const textPath = join(out, `s${k + 1}.txt`)
  const cached = existsSync(receiptPath) && existsSync(textPath) && readFileSync(textPath, 'utf8') === s.text
  if (!cached) {
    // The runtime logs model loading before the receipt; the receipt is the last top-level JSON object.
    const stdout = execFileSync(TTS, ['--text', s.text, '--output', join(out, s.wav)], { encoding: 'utf8' })
    writeFileSync(receiptPath, stdout.slice(stdout.startsWith('{') ? 0 : stdout.lastIndexOf('\n{') + 1))
    writeFileSync(textPath, s.text)
  }
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  s.duration = receipt.duration_seconds
  if (!(s.duration > 0)) throw new Error(`scene ${k + 1}: no duration in the TTS receipt`)
  console.log(`scene ${k + 1}: ${s.duration}s`)
})

// 2. Check the narrated numbers on a scratch page, then record a clean run paced by the narration.
const browser = await chromium.launch({ channel: 'chrome' })
const probe = await browser.newPage()
await probe.goto(url)
await probe.evaluate(() => localStorage.clear())
await probe.goto(url)
await probe.getByRole('button', { name: 'Financial aid email' }).click()
for (const s of scenes) {
  for (const [sel, want] of s.check ?? []) {
    const got = (await probe.locator(sel).first().innerText()).replace(/\s+/g, ' ')
    if (!got.includes(want)) throw new Error(`narration check failed: ${sel} lacks "${want}"`)
  }
}
await probe.close()

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  bypassCSP: true,
  acceptDownloads: true,
  recordVideo: { dir: join(out, 'rec'), size: { width: 1280, height: 800 } },
})
await context.addInitScript(() => {
  // Repaint a 2-pixel element every frame so the screencast keeps emitting frames on static scenes.
  const tick = () => {
    let el = document.getElementById('__keep_paint')
    if (!el && document.body) {
      el = document.createElement('div')
      el.id = '__keep_paint'
      Object.assign(el.style, { position: 'fixed', right: '0', bottom: '0', width: '2px', height: '2px', pointerEvents: 'none', zIndex: '2147483647' })
      document.body.appendChild(el)
    }
    if (el) el.style.opacity = el.style.opacity === '0.01' ? '0.02' : '0.01'
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const page = await context.newPage()
const v0 = Date.now()
await page.goto(url)
await page.evaluate(() => localStorage.clear())
await page.goto(url)
// Load the example, then go back to the input view so the video starts on the pasted email.
await page.getByRole('button', { name: 'Financial aid email' }).click()
await page.getByRole('button', { name: 'Edit or paste new text' }).click()
await page.getByLabel('Instructions').waitFor()
await page.addStyleTag({ content: 'html { scroll-behavior: smooth; } #steps-title { scroll-margin-top: 24px; }' })
await page.waitForTimeout(400)
const t0 = Date.now()
const timeline = { video: 'rec.webm', trim_start_ms: t0 - v0, scenes: [] }
for (const s of scenes) {
  const start = Date.now() - t0
  timeline.scenes.push({ start_ms: start + 400, wav: s.wav, text: s.text, duration_s: s.duration })
  await page.waitForTimeout(400)
  await s.run(page)
  const left = start + 400 + s.duration * 1000 + 600 - (Date.now() - t0)
  if (left > 0) await page.waitForTimeout(left)
}
await page.waitForTimeout(900)
await context.close()
await browser.close()
const webm = readdirSync(join(out, 'rec')).find((f) => f.endsWith('.webm'))
renameSync(join(out, 'rec', webm), join(out, 'rec.webm'))
writeFileSync(join(out, 'timeline.json'), JSON.stringify(timeline, null, 1))
console.log('recorded', ((Date.now() - t0) / 1000).toFixed(1), 's after a', timeline.trim_start_ms, 'ms load', existsSync(join(out, 'rec.webm')) ? '' : '(no video!)')
