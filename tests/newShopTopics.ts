import { expect, type Page } from '@playwright/test'

/**
 * The offline fixture coach's questions. There is no fixed script (owner, 17 Oct): every
 * conversation asks what is still missing in its own order (name, kind and place first, then
 * hours and the photo), so a spec reads which topic was asked and answers that one.
 */
export const ASKED = {
  name: 'What is your business called?',
  kind: 'What do you sell?',
  place: 'Are you at the shop right now?',
  hours: 'What are your opening hours?',
  photo: 'Can you take a photo of your shop?',
} as const
export type Topic = keyof typeof ASKED

/** The greeting asks one of the core three, whichever comes first for this owner. */
export const FIRST_QUESTION =
  /What is your business called\?|What do you sell\?|Are you at the shop right now\?/

export function topicOf(text: string): Topic | null {
  return (Object.keys(ASKED) as Topic[]).find((key) => text.includes(ASKED[key])) ?? null
}

/** Every question the coach asked so far, in order (its chat lines). */
export async function askedTopics(page: Page): Promise<Topic[]> {
  const lines = await page.getByRole('log').locator('li').allInnerTexts()
  return lines.map(topicOf).filter((topic): topic is Topic => topic !== null)
}

/**
 * The coach's next question once more than `count` were asked; null when the summary card came
 * instead (everything gathered).
 */
export async function nextQuestion(page: Page, count: number, timeout = 15_000) {
  let found: Topic | null = null
  await expect
    .poll(
      async () => {
        const asked = await askedTopics(page)
        if (asked.length > count) {
          found = asked.at(-1) ?? null
          return true
        }
        if (await page.getByTestId('shop-summary').isVisible()) {
          found = null
          return true
        }
        return false
      },
      { timeout },
    )
    .toBe(true)
  return found as Topic | null
}
