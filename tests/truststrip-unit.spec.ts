import { expect, test } from '@playwright/test'
import { readTrustStrip } from '../src/auth/trustStrip.js'

test('trust strip fails closed unless explicitly enabled', () => {
  for (const value of [
    undefined,
    null,
    {},
    true,
    { enabled: 'true' },
    { enabled: false, support_whatsapp: 'https://wa.me/919876543210' },
  ])
    expect(readTrustStrip(value)).toEqual({ enabled: false, supportWhatsapp: '' })
})

test('only an HTTPS WhatsApp phone link enables human support', () => {
  const link = 'https://wa.me/919876543210'
  expect(readTrustStrip({ enabled: true, support_whatsapp: link })).toEqual({
    enabled: true,
    supportWhatsapp: link,
  })
  for (const value of [
    undefined,
    123,
    '',
    'javascript:alert(1)',
    'http://wa.me/919876543210',
    'https://wa.me.evil.test/919876543210',
    'https://wa.me/01234567',
    `${link}?text=private`,
    `${link}/extra`,
    `${link}\n`,
  ])
    expect(readTrustStrip({ enabled: true, support_whatsapp: value })).toEqual({
      enabled: true,
      supportWhatsapp: '',
    })
})
