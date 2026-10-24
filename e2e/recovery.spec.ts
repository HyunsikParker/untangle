import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'

const instructions = 'Submit the signed form by Friday.\nCall the office.'
const saved = {
  text: instructions, received: '2026-10-26', view: 'list',
  done: ['Submit the signed form by Friday.'], have: [],
  settings: { size: 1, relaxed: false, easyFont: false },
}

test('damaged saved fields do not prevent reading the recovered instructions', async ({ page }) => {
  const damaged = JSON.stringify({ ...saved, done: null, have: false, settings: { size: 99, relaxed: 'false' } })
  await page.addInitScript((raw) => localStorage.setItem('untangle.v1', raw), damaged)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('.steps > li')).toHaveCount(2, { timeout: 2500 })
  expect(errors).toEqual([])
  await expect(page.getByRole('alert')).toContainText('saved')
  expect(await page.evaluate(() => localStorage.getItem('untangle.v1'))).toBe(damaged)
  await page.screenshot({ path: 'test-results/recovery-desktop.png', fullPage: true })
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([])
  await page.setViewportSize({ width: 375, height: 760 })
  await page.getByRole('button', { name: 'Larger', exact: true }).click()
  await page.getByRole('button', { name: 'Larger', exact: true }).click()
  await page.getByRole('button', { name: 'Wide spacing' }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'test-results/recovery-phone-dark.png', fullPage: true })
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([])
  const [copy] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download saved copy' }).click()])
  expect(readFileSync((await copy.path())!, 'utf8')).toBe(damaged)
  await page.getByRole('button', { name: 'Save recovered checklist' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('untangle.v1')!).text)).toBe(instructions)
})

test('failed saving is visible and can be retried without losing current work', async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem('untangle.v1', JSON.stringify(value))
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new DOMException('Storage is full', 'QuotaExceededError') }
    Object.assign(window, { restoreSaving: () => { Storage.prototype.setItem = original } })
  }, saved)
  await page.goto('/')
  await page.getByLabel('2. Call the office.').check()
  await expect(page.getByRole('alert')).toContainText('saved', { timeout: 2500 })
  await page.evaluate(() => (window as unknown as { restoreSaving: () => void }).restoreSaving())
  await page.getByRole('button', { name: 'Retry saving' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('untangle.v1')!).done)).toEqual([
    'Submit the signed form by Friday.', 'Call the office.',
  ])
})

test('editing background information retains completion of unchanged instructions', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('untangle.v1', JSON.stringify(value)), saved)
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit or paste new text' }).click()
  await page.getByLabel('Instructions').fill(`${instructions}\nThe office is on the second floor.`)
  await page.getByRole('button', { name: 'Untangle it' }).click()
  await expect(page.getByLabel('1. Submit the signed form by Friday.')).toBeChecked({ timeout: 2500 })
  await expect(page.getByLabel('2. Call the office.')).not.toBeChecked()
  await page.getByRole('button', { name: 'Edit or paste new text' }).click()
  await page.getByLabel('Instructions').fill('Submit the updated form by Friday.\nCall the office.')
  await page.getByRole('button', { name: 'Untangle it' }).click()
  await expect(page.locator('.steps input:checked')).toHaveCount(0)
})


test('unreadable JSON stays untouched while the user recovers their work', async ({ page }) => {
  const raw = '{"text":"Submit the form", broken'
  await page.addInitScript((value) => localStorage.setItem('untangle.v1', value), raw)
  await page.goto('/')
  await page.getByLabel('Instructions').fill('Submit the recovered form.')
  await page.getByRole('button', { name: 'Untangle it' }).click()
  expect(await page.evaluate(() => localStorage.getItem('untangle.v1'))).toBe(raw)
  await page.getByRole('button', { name: 'Save recovered checklist' }).click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('untangle.v1')!).text)).toBe('Submit the recovered form.')
})

test('storage access denied still allows a checklist and a local text download', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Not allowed', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new Error('Must not try to replace an unread saved checklist') }
  })
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173') && !request.url().startsWith('blob:')) external.push(request.url()) })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('could not open your saved checklist')
  await page.getByLabel('Instructions').fill(instructions)
  await page.getByRole('button', { name: 'Untangle it' }).click()
  await page.getByLabel('2. Call the office.').check()
  const [copy] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my instructions' }).click()])
  const text = readFileSync((await copy.path())!, 'utf8')
  expect(text).toContain(instructions)
  expect(text).toContain('[x] 2. Call the office.')
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('examples preserve personal text and progress on return and reload', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Instructions').fill(instructions)
  await page.getByRole('button', { name: 'Untangle it' }).click()
  await page.getByLabel('1. Submit the signed form by Friday.').check()
  await page.getByRole('button', { name: 'Edit or paste new text' }).click()
  const before = await page.evaluate(() => localStorage.getItem('untangle.v1'))
  await page.getByRole('button', { name: 'Financial aid email' }).click()
  await page.locator('.steps input').first().check()
  expect(await page.evaluate(() => localStorage.getItem('untangle.v1'))).toBe(before)
  await page.screenshot({ path: 'test-results/example-preview-desktop.png', fullPage: true })
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([])
  await page.getByRole('button', { name: 'Return to my instructions' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Instructions')).toHaveValue(instructions)
  await expect(page.getByLabel('Instructions')).toBeFocused()
  await page.getByRole('button', { name: 'Move-out letter' }).click()
  await page.reload()
  await expect(page.getByLabel('Instructions')).toHaveValue(instructions)
  await page.getByRole('button', { name: 'Untangle it' }).click()
  await expect(page.getByLabel('1. Submit the signed form by Friday.')).toBeChecked()
  await page.getByRole('button', { name: 'Clear my text' }).click()
  await page.reload()
  await expect(page.getByLabel('Instructions')).toHaveValue('')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('untangle.v1')!).done)).toEqual([])
})

test('a changed parent condition resets completion of its child instruction', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Instructions').fill('Only if you received an offer, complete the following:\n- Sign the form.')
  await page.getByRole('button', { name: 'Untangle it' }).click()
  await page.locator('.steps input').check()
  await page.getByRole('button', { name: 'Edit or paste new text' }).click()
  await page.getByLabel('Instructions').fill('Unless you already signed, complete the following:\n- Sign the form.')
  await page.getByRole('button', { name: 'Untangle it' }).click()
  await expect(page.locator('.steps input')).not.toBeChecked()
})
