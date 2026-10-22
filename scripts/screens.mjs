// Captures the Devpost gallery screenshots from the live build:
// node scripts/screens.mjs https://hyunsikparker.github.io/untangle/ ../submission/screens
import { chromium } from '@playwright/test'

const [url, out] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome' })

const desk = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 })
await desk.goto(url)
await desk.evaluate(() => localStorage.clear())
await desk.goto(url)
await desk.screenshot({ path: `${out}/01-paste.png` })
await desk.getByRole('button', { name: 'Financial aid email' }).click()
await desk.locator('.steps').waitFor()
await desk.screenshot({ path: `${out}/02-checklist.png` })

const steps = desk.locator('.steps')
await desk.locator('.steps > li').nth(3).getByRole('button', { name: 'Original wording' }).click()
await steps.scrollIntoViewIfNeeded()
const top = await desk.locator('#steps-title').boundingBox()
await desk.evaluate((y) => window.scrollTo(0, y), top.y + (await desk.evaluate(() => window.scrollY)) - 20)
const t2 = await desk.locator('#steps-title').boundingBox()
const s2 = await steps.boundingBox()
await desk.screenshot({ path: `${out}/03-steps.png`, clip: { x: s2.x - 16, y: t2.y - 16, width: s2.width + 32, height: s2.y + s2.height - t2.y + 32 } })

await desk.evaluate(() => window.scrollTo(0, 0))
await desk.getByRole('button', { name: 'Start one step at a time' }).click()
await desk.getByRole('dialog').getByRole('button', { name: 'Start', exact: true }).click()
await desk.getByRole('dialog').locator('.focus-progress').filter({ hasText: 'Step 1 of 4' }).waitFor()
await desk.screenshot({ path: `${out}/04-focus.png` })
await desk.keyboard.press('Escape')

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark' })
await phone.goto(url)
await phone.evaluate(() => localStorage.clear())
await phone.goto(url)
await phone.getByRole('button', { name: 'Move-out letter' }).click()
await phone.getByRole('button', { name: 'Larger', exact: true }).click()
await phone.getByRole('button', { name: 'Start one step at a time' }).click()
await phone.getByRole('dialog').getByRole('button', { name: 'Start', exact: true }).click()
await phone.getByRole('dialog').locator('.focus-progress').filter({ hasText: 'Step 1 of 5' }).waitFor()
await phone.screenshot({ path: `${out}/05-phone.png` })
await browser.close()
console.log('saved')
