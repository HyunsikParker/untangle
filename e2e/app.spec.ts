import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

function watch(page: Page) {
  const errors: string[] = []
  const requests: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (r) => {
    const url = r.url()
    if (!url.startsWith('http://127.0.0.1:4173') && !url.startsWith('blob:') && !url.startsWith('data:')) requests.push(url)
  })
  return { errors, requests }
}

test('financial aid sample: checklist, one step at a time, calendar file', async ({ page }) => {
  const seen = watch(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Turn a wall of instructions into one clear step at a time')
  await page.getByRole('button', { name: 'Financial aid email' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Action needed: verify your 2027-28 financial aid')
  await expect(page.locator('.summary')).toContainText('4 steps')
  await expect(page.locator('.summary')).toContainText('3 things to have ready · 3 warnings')
  await expect(page.locator('.steps > li')).toHaveCount(4)
  await expect(page.locator('.steps > li').first()).toContainText('Submit the following documents through the Student Portal')
  await expect(page.locator('.steps > li').first().locator('.badge.deadline')).toContainText(', 5 pm · in ')
  await expect(page.locator('.steps > li').nth(1).locator('.badge.condition')).toHaveText('If you are a dependent student')
  await expect(page.locator('.card.ready li')).toHaveCount(3)
  await expect(page.locator('.card.warn li')).toHaveCount(3)

  // Original wording is one click away.
  await page.locator('.steps > li').nth(3).getByRole('button', { name: 'Original wording' }).click()
  await expect(page.locator('.steps > li').nth(3).locator('.original')).toHaveText(/^After you upload your documents, check your Northfield email within 10 business days/)

  // Focus mode: before-you-start card, then each step; keyboard only.
  await page.getByRole('button', { name: 'Start one step at a time' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Before you start')
  await page.keyboard.press('Enter')
  await expect(dialog.locator('.focus-progress')).toHaveText('Step 1 of 4')
  await expect(dialog.getByRole('heading', { level: 2 })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog.locator('.focus-progress')).toHaveText('Step 2 of 4')
  await dialog.getByRole('button', { name: 'Skip for now' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('3 steps done, 1 to come back to')
  await expect(dialog.locator('.focus-card li')).toHaveText(['If you are a dependent student: One of your parents must also sign the worksheet.'])
  await dialog.getByRole('button', { name: 'Back to the checklist' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.steps > li.is-done')).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Continue: 1 left' })).toBeVisible()

  // Only the 5 pm deadline is dated: "within 10 business days" counts from the upload, so it gets no guessed date.
  const download = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Add dates to calendar' }).click()]).then(([d]) => d)
  expect(download.suggestedFilename()).toBe('untangle-dates.ics')
  const ics = readFileSync((await download.path())!, 'utf8')
  expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(1)
  expect(ics).toMatch(/DTSTART:\d{8}T170000\r\n/)
  await expect(page.locator('.steps > li').nth(3).locator('.badge.deadline')).toHaveCount(0)
  await expect(page.locator('.dates li')).toHaveCount(1) // office hours ("Monday to Friday, 9 a.m.") are not a date

  // The move-out letter has a timed deadline and an all-day one.
  await page.getByRole('button', { name: 'Edit or paste new text' }).click()
  await page.getByRole('button', { name: 'Move-out letter' }).click()
  const moveout = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Add dates to calendar' }).click()]).then(([d]) => d)
  await moveout.saveAs('test-results/untangle-moveout.ics') // for scripts/check_ics.py
  const ics2 = readFileSync((await moveout.path())!, 'utf8')
  expect(ics2.match(/BEGIN:VEVENT/g)?.length).toBe(2)
  expect(ics2).toMatch(/DTSTART;VALUE=DATE:\d{8}\r\n/)
  expect(ics2).toMatch(/DTSTART:\d{8}T120000\r\n/)

  const a11y = await new AxeBuilder({ page }).analyze()
  if (a11y.violations.length) console.log(JSON.stringify(a11y.violations.flatMap((v) => v.nodes.map((n) => ({ id: v.id, t: n.target })))).slice(0, 3000))
  expect(a11y.violations.map((v) => v.id)).toEqual([])
  expect(seen.errors).toEqual([])
  expect(seen.requests).toEqual([])
})

test('own text: paste, untangle, reading settings and progress survive a reload', async ({ page }) => {
  const seen = watch(page)
  await page.goto('/')
  await page.getByLabel('Instructions').fill([
    'Welcome to the team! Before your first day, please complete the following:',
    '1) Sign your offer letter.',
    '2) Fill out the tax form and bring two forms of ID on day one.',
    'Parking is not provided, so plan to take the bus.',
  ].join('\n'))
  await page.getByRole('button', { name: 'Untangle it' }).click()
  await expect(page.locator('.steps > li')).toHaveCount(2)
  await expect(page.locator('.card.warn li')).toHaveText(['Parking is not provided, so plan to take the bus.'])
  await page.getByLabel('1. Sign your offer letter.').check()

  await page.getByRole('button', { name: 'Larger', exact: true }).click()
  await page.getByRole('button', { name: 'Easy-read font' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-size', '2')
  await expect(page.locator('html')).toHaveAttribute('data-easy', 'true')

  await page.reload()
  await expect(page.locator('.steps > li.is-done')).toHaveCount(1)
  await expect(page.locator('html')).toHaveAttribute('data-size', '2')
  const a11y = await new AxeBuilder({ page }).analyze()
  expect(a11y.violations.map((v) => v.id)).toEqual([])
  expect(seen.errors).toEqual([])
  expect(seen.requests).toEqual([])
})

test('phone width: no horizontal scroll and focus mode fits', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Move-out letter' }).click()
  await expect(page.locator('.steps > li')).toHaveCount(5)
  await page.getByRole('button', { name: 'Start one step at a time' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true })).toBeInViewport()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('conditional list: warnings, focus mode and calendar retain the qualification', async ({ page }) => {
  const seen = watch(page)
  await page.goto('/')
  await page.getByLabel('Instructions').fill([
    'Only if you received an offer, complete the following by Friday at 5 pm:',
    '- Unless you already signed, sign the agreement.',
    '- Upload your ID.',
    '- Do not email your passport.',
  ].join('\n'))
  await page.locator('input[type="date"]').fill('2026-10-26')
  await page.getByRole('button', { name: 'Untangle it' }).click()
  await expect(page.locator('.steps > li')).toHaveCount(2)
  await expect(page.locator('.steps .badge.condition')).toHaveText([
    'Only if you received an offer; Unless you already signed', 'Only if you received an offer',
  ])
  await expect(page.locator('.card.warn li')).toHaveText(['Only if you received an offer: Do not email your passport.'])
  await expect(page.locator('.dates li')).toHaveCount(2)
  await expect(page.locator('.dates li').first()).toContainText('Only if you received an offer; Unless you already signed')
  await page.screenshot({ path: 'test-results/conditional-checklist-desktop.png', fullPage: true })

  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Add dates to calendar' }).click(),
  ])
  await download.saveAs('test-results/untangle-conditional.ics')
  const ics = readFileSync((await download.path())!, 'utf8').replace(/\r\n /g, '')
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  expect(ics).toContain('SUMMARY:Due: Only if you received an offer\\; Unless you already signed: Sign the agreement.')
  expect(ics).toContain('ACTION:DISPLAY\r\nDESCRIPTION:Only if you received an offer: Upload your ID.')
  expect(ics.match(/DTSTART:20261030T170000/g)).toHaveLength(2)

  await page.setViewportSize({ width: 375, height: 760 })
  await page.getByRole('button', { name: 'Start one step at a time' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(dialog.locator('.badge.condition')).toHaveText('Only if you received an offer; Unless you already signed')
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'test-results/conditional-focus-phone.png', fullPage: true })
  await dialog.getByRole('button', { name: 'Skip for now' }).click()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(dialog.locator('.focus-card li')).toContainText('Only if you received an offer; Unless you already signed: Sign the agreement.')
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([])
  expect(seen.errors).toEqual([])
  expect(seen.requests).toEqual([])
})
