import { expect, test } from '@playwright/test'
import { aiInfoCopy, type AiFeature } from '../src/features/v1/aiInfoCopy.js'

test('AI explanations name the capabilities and their fallback conditions in both languages', () => {
  const providers: Record<AiFeature, string[]> = {
    forecast: ['TimesFM', 'BigQuery'],
    coach: ['Gemini', 'ADK'],
    voice: ['Gemini Live'],
    photo: ['Gemini vision', 'Document AI'],
    places: ['Google Maps'],
  }
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
  expect(en.forecast).toContain('or a weekday average')
  expect(en.coach).toContain('offline mode')
  expect(en.voice).toContain('when live voice is available')
  expect(en.photo).toContain('when enabled')
  expect(en.places).toContain('demo mode')
})
