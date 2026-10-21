import { confirmShopPin, suggestShopPin } from './pinSupport.js'
import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'
import {
  askedTopics,
  FIRST_QUESTION,
  FOLLOW_UPS,
  nextQuestion,
  type Topic,
} from './newShopTopics.js'

// #112 (owner, 17 Oct): the coach opens with "tell me about your shop", takes everything from
// that one answer, never asks again what the owner said, and then asks at most two follow-ups
// that fit this business (a hardware store never hears a food question). On a phone.
test.use({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true })
test.beforeEach(async ({ page }) => {
  await localOnly(page)
  await suggestShopPin(page)
})

async function begin(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
}

/** Says `text` and returns the coach's next question (null: the summary card came). */
async function answer(page: Page, text: string): Promise<Topic | null> {
  const count = (await askedTopics(page)).length
  await page.getByLabel('Message', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  // OB-168 / OB-188: follow-ups start after the owner confirms the known place.
  if (text.includes('location:')) {
    await confirmShopPin(page)
  }
  return nextQuestion(page, count)
}

async function coachLines(page: Page) {
  return (await page.getByRole('log').locator('li').allInnerTexts()).join('\n')
}

test('a hardware store: one open answer, then only its own question and the hours', async ({
  page,
}) => {
  await enter(page)
  await begin(page)
  // The greeting is the open question, never the name.
  expect(await askedTopics(page)).toEqual(['open'])
  let next = await answer(
    page,
    'name: Sharma Hardware; category: hardware, paint and pipes; location: Karol Bagh',
  )
  // Name, kind and place came in the one answer: live at once, none of them asked.
  await expect(page.getByTestId('shop-live')).toHaveText('Live')
  expect(next).toBe('followup')
  await expect(page.getByRole('log')).toContainText(FOLLOW_UPS.brandsStocked)
  next = await answer(page, 'Asian Paints and Havells')
  expect(next).toBe('hours')
  next = await answer(page, 'hours: 9 am to 9 pm')
  expect(next).toBe('photo')
  await page.getByTestId('camera-card').getByRole('button', { name: 'Skip for now' }).click()
  await expect(page.getByTestId('shop-summary')).toBeVisible()
  expect(await askedTopics(page)).toEqual(['open', 'followup', 'hours', 'photo'])
  const said = await coachLines(page)
  expect(said).not.toMatch(/menu|price|pay|delivery|halal|veg|food|tea|cake|seat/i)
})

test('a tea stall that says its hours: one tea-stall question, never the hours', async ({
  page,
}) => {
  await enter(page)
  await begin(page)
  let next = await answer(
    page,
    'name: Lakshmi Tea Stall; category: chai aur samosa; location: Indiranagar metro; hours: 6 am to 10 pm',
  )
  expect(next).toBe('followup')
  await expect(page.getByRole('log')).toContainText(FOLLOW_UPS.seating)
  next = await answer(page, 'baad mein')
  expect(next).toBe('photo')
  const said = await coachLines(page)
  expect(said).not.toMatch(/opening hours|menu|price|pay|delivery|halal/i)
  expect(await askedTopics(page)).toEqual(['open', 'followup', 'photo'])
})
