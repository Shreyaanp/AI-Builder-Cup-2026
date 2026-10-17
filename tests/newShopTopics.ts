import { expect, type Page } from '@playwright/test'

/**
 * The offline fixture coach's questions (#112). It opens with one open question ("Can you tell
 * me about your shop?"); the basics (name, kind, place) are asked only when the answer missed
 * them, in each conversation's own order; then at most two follow-ups that fit the business (its
 * own question, then the hours when there is room); then the photo. A spec reads which topic was
 * asked and answers that one.
 */
export const ASKED = {
  open: 'Can you tell me about your shop?',
  name: 'What is your business called?',
  kind: 'What do you sell?',
  place: 'Are you at the shop right now?',
  hours: 'What are your opening hours?',
  photo: 'Can you take a photo of your shop?',
} as const

/**
 * The business's own follow-ups from the offline reading (business_understanding.OFFLINE_EXTRAS):
 * a tea stall is asked about seating, a tailor whom they stitch for, never a generic question.
 */
export const FOLLOW_UPS = {
  seating: 'Can customers sit and have their tea, or is it takeaway only?',
  stitching: 'Do you stitch for men, women or both?',
  brandsRepaired: 'Which phone brands do you repair?',
  brandsStocked: 'Which brands do customers mostly come to you for?',
  orderAhead: 'How many days ahead should customers order a cake?',
  classes: 'Which classes or subjects do you teach?',
} as const
export type Topic = keyof typeof ASKED | 'followup'

/** The greeting is always the open question. */
export const FIRST_QUESTION = /Can you tell me about your shop\?/

/** The same questions from the offline coach in Hindi (#100: a Hindi owner is asked in Hindi). */
export const ASKED_HI: Record<keyof typeof ASKED, string> = {
  open: 'क्या आप अपनी दुकान के बारे में बताएँगे?',
  name: 'आपके कारोबार का नाम क्या है?',
  kind: 'आप क्या बेचते हैं?',
  place: 'क्या आप अभी दुकान पर हैं?',
  hours: 'आपकी दुकान कब से कब तक खुलती है?',
  photo: 'क्या आप अपनी दुकान की फ़ोटो ले सकते हैं?',
}

export const FOLLOW_UPS_HI: Record<keyof typeof FOLLOW_UPS, string> = {
  seating: 'क्या ग्राहक बैठकर चाय पी सकते हैं, या सिर्फ़ ले जाने के लिए है?',
  stitching: 'आप पुरुषों, महिलाओं या दोनों के कपड़े सिलते हैं?',
  brandsRepaired: 'आप किन कंपनियों के फ़ोन ठीक करते हैं?',
  brandsStocked: 'ग्राहक आपके पास ज़्यादातर किन ब्रांड के लिए आते हैं?',
  orderAhead: 'ग्राहकों को केक कितने दिन पहले ऑर्डर करना चाहिए?',
  classes: 'आप कौन-सी कक्षाएँ या विषय पढ़ाते हैं?',
}

export const FIRST_QUESTION_HI = new RegExp(ASKED_HI.open.replace('?', '\\?'))

export function topicOf(text: string): Topic | null {
  const followUp = (Object.keys(FOLLOW_UPS) as (keyof typeof FOLLOW_UPS)[]).some(
    (key) => text.includes(FOLLOW_UPS[key]) || text.includes(FOLLOW_UPS_HI[key]),
  )
  if (followUp) return 'followup'
  return (
    (Object.keys(ASKED) as (keyof typeof ASKED)[]).find(
      (key) => text.includes(ASKED[key]) || text.includes(ASKED_HI[key]),
    ) ?? null
  )
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
