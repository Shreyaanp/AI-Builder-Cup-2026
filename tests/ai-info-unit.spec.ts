import { expect, test } from '@playwright/test'
import { LOCALES } from '../src/i18n/locales.js'
import { aiInfoCopy, type AiFeature } from '../src/features/v1/aiInfoCopy.js'

const providers: Record<AiFeature, string[]> = {
  forecast: [],
  coach: ['Gemini', 'ADK'],
  voice: ['Gemini Live'],
  photo: ['Gemini vision', 'Document AI'],
  places: ['Google Maps'],
}

test('AI explanations name the capabilities and their fallback conditions in English and Hindi', () => {
  const en = aiInfoCopy('en')
  const hi = aiInfoCopy('hi')
  expect(en.label).toBe('How this works')
  expect(hi.label).toBe('यह कैसे काम करता है')
  for (const feature of Object.keys(providers) as AiFeature[]) {
    for (const provider of providers[feature]) {
      expect(en[feature]).toContain(provider)
      expect(hi[feature]).toContain(provider)
    }
    expect(hi[feature]).toMatch(/[\u0900-\u097f]/)
    expect(hi[feature]).not.toBe(en[feature])
    expect(en[feature].match(/[.!?]/g)).toHaveLength(1)
    expect(hi[feature].match(/।/g)).toHaveLength(1)
  }
  // Simplify batch 1: the forecast explainer speaks plain words, no model or warehouse names.
  expect(en.forecast).toContain('recent weeks')
  expect(en.forecast).not.toMatch(/TimesFM|BigQuery/)
  expect(en.coach).toContain('offline mode')
  expect(en.voice).toContain('when live voice is available')
  expect(en.photo).toContain('when enabled')
  expect(en.places).toContain('demo mode')
})

test('every shipped locale has translated labels and copy for every AI feature', () => {
  for (const locale of LOCALES) {
    const localized = aiInfoCopy(locale)
    expect(localized.label.trim(), `${locale} label`).not.toBe('')
    if (locale !== 'en') expect(localized.label, `${locale} label`).not.toBe('How this works')
    for (const feature of Object.keys(providers) as AiFeature[]) {
      expect(localized[feature].trim(), `${locale}.${feature}`).not.toBe('')
      if (locale !== 'en')
        expect(localized[feature], `${locale}.${feature}`).not.toBe(aiInfoCopy('en')[feature])
      for (const productName of providers[feature]) {
        expect(localized[feature], `${locale}.${feature}`).toContain(productName)
      }
    }
  }
})
