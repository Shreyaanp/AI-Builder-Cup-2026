import { expect, test } from '@playwright/test'
import { LOCALES } from '../src/i18n/locales.js'
import { parseNumber, readNumber } from '../src/features/v1/readNumber.js'
import { moneyLocale } from '../src/region/region.js'
import { numberForEditing } from '../src/features/v1/format.js'

for (const locale of LOCALES) {
  test(`OB-279: ${locale} parses whole entries using its number convention`, () => {
    const commaDecimal = locale === 'id' || locale === 'vi'
    const decimal = commaDecimal ? ',' : '.'
    const group = commaDecimal ? '.' : ','
    for (const [input, expected] of [
      ['1000', 1000],
      [`1${group}000`, 1000],
      [`1000${decimal}50`, 1000.5],
      [`1${group}000${decimal}50`, 1000.5],
      [`0${decimal}5`, 0.5],
      ['0', 0],
      [' 1000 ', 1000],
      [new Intl.NumberFormat(locale).format(1234567.89), 1234567.89],
    ] as const) {
      expect(parseNumber(input, locale), input).toBe(expected)
    }
    for (const input of [
      '',
      ' ',
      '-1',
      '+1',
      '1e3',
      '0x10',
      'Infinity',
      'NaN',
      '1000 rupees',
      '1 000',
      '1,,000',
      '1..000',
      `1${group}00`,
      `1${group}0000`,
      `1${decimal}2${decimal}3`,
      `1${decimal}`,
      `1${decimal}005`,
      `1${decimal}000${group}50`,
      '9007199254740992',
    ]) {
      expect(parseNumber(input, locale), input).toBeNull()
    }
  })
}

for (const locale of ['en-IN', 'hi', 'bn', 'ta', 'te', 'mr', 'kn']) {
  test(`OB-279: ${locale} accepts Indian grouping and plain decimals`, () => {
    for (const [input, expected] of [
      ['1,000', 1000],
      ['1,00,000', 100000],
      ['1,00,000.50', 100000.5],
      ['1000', 1000],
      ['1000.50', 1000.5],
      ['1,000,000', 1000000],
    ] as const) {
      expect(parseNumber(input, locale), input).toBe(expected)
    }
    for (const input of ['1,00', '1,0,000', '100,00', '1,00,00', '1.000,50']) {
      expect(parseNumber(input, locale), input).toBeNull()
    }
  })
}

for (const locale of ['id', 'vi']) {
  test(`OB-279: ${locale} keeps a decimal comma distinct from grouping`, () => {
    expect(parseNumber('1,000', locale)).toBeNull()
    expect(parseNumber('1.000', locale)).toBe(1000)
    expect(parseNumber('1000.50', locale)).toBeNull()
    expect(parseNumber('1.00.000', locale)).toBeNull()
  })
}

for (const language of ['id', 'vi', 'de', 'fr']) {
  for (const currency of ['INR', 'SGD', 'MYR', 'IDR', 'VND', 'JPY', 'KRW']) {
    test(`OB-279 OB-284: ${language} + ${currency} refuses excess decimal digits`, () => {
      const locale = moneyLocale(currency, language) ?? language
      const zeroDigits = ['IDR', 'VND', 'JPY', 'KRW'].includes(currency)
      for (const input of ['1,000', '15,000', '1,005']) {
        expect(parseNumber(input, locale, currency), input).toBeNull()
      }
      expect(parseNumber('1000', locale, currency)).toBe(1000)
      expect(parseNumber('1000,50', locale, currency)).toBe(zeroDigits ? null : 1000.5)
      expect(parseNumber('1,0', locale, currency)).toBe(zeroDigits ? null : 1)
    })
  }
}

test('OB-279 OB-284: INR 1.005 is refused instead of rounding review and save differently', () => {
  expect(parseNumber('1.005', 'en-IN', 'INR')).toBeNull()
  expect(parseNumber('1.01', 'en-IN', 'INR')).toBe(1.01)
  expect(parseNumber('1.005', 'en', 'KWD')).toBe(1.005)
  expect(parseNumber('1.0050', 'en', 'KWD')).toBeNull()
})

test('OB-279: rupee amounts save as typed: 1,000 / 1,00,000 / ₹ 1,000 / Rs. 1,000', () => {
  for (const locale of ['en-IN', 'hi-IN']) {
    for (const [input, expected] of [
      ['1,000', 1000],
      ['1,00,000', 100000],
      ['₹ 1,000', 1000],
      ['₹1,00,000', 100000],
      ['Rs. 1,000', 1000],
      ['1,000 ₹', 1000],
      ['INR 1,000.50', 1000.5],
    ] as const) {
      expect(parseNumber(input, locale, 'INR'), `${locale} ${input}`).toBe(expected)
    }
    // A currency mark is money only; a quantity never carries one.
    expect(parseNumber('₹ 2', locale, 'INR', 'quantity')).toBeNull()
  }
})

test('OB-279: a lone comma in a rupee shop is asked about, never guessed', () => {
  expect(readNumber('1,5', 'en-IN', 'INR')).toEqual({
    ok: false,
    reason: 'ambiguous',
    options: [1.5, 15],
  })
  expect(readNumber('12,50', 'hi-IN', 'INR', 'quantity')).toEqual({
    ok: false,
    reason: 'ambiguous',
    options: [12.5, 1250],
  })
  // Yen has no decimals, so "1,5" can only be wrong, not a question.
  expect(readNumber('1,5', 'en', 'JPY')).toEqual({ ok: false, reason: 'invalid' })
  expect(readNumber('', 'en-IN', 'INR')).toEqual({ ok: false, reason: 'empty' })
})

test('OB-279: a decimal-comma shop still reads 2,5 as two and a half', () => {
  for (const locale of ['id', 'vi', 'id-ID', 'vi-VN']) {
    expect(parseNumber('2,5', locale, 'IDR', 'quantity'), locale).toBe(2.5)
    expect(parseNumber('2,5', locale, 'EUR'), locale).toBe(2.5)
    expect(parseNumber('15.000', locale, 'IDR'), locale).toBe(15000)
    expect(parseNumber('Rp 15.000', 'id', 'IDR')).toBe(15000)
  }
})

test('OB-281: quantities take up to three decimals whatever the currency', () => {
  for (const [locale, currency] of [
    ['en-IN', 'INR'],
    ['en', 'JPY'],
    ['en', 'IDR'],
    ['en-SG', 'SGD'],
  ] as const) {
    for (const [input, expected] of [
      ['0.125', 0.125],
      ['2.5', 2.5],
      ['1.5', 1.5],
      ['1,000.125', 1000.125],
    ] as const) {
      expect(parseNumber(input, locale, currency, 'quantity'), `${currency} ${input}`).toBe(
        expected,
      )
    }
    expect(parseNumber('0.1255', locale, currency, 'quantity')).toBeNull()
  }
  expect(parseNumber('0,125', 'id', 'IDR', 'quantity')).toBe(0.125)
  // Money keeps the currency's minor digits.
  expect(parseNumber('0.125', 'en-IN', 'INR')).toBeNull()
  expect(parseNumber('2.5', 'en', 'JPY')).toBeNull()
})

test('PR 701: 170/- and ₹170/- are 170 rupees', () => {
  for (const locale of ['en-IN', 'hi-IN']) {
    for (const input of ['170/-', '₹170/-', 'Rs. 170/-', '₹ 1,000/-']) {
      expect(parseNumber(input, locale, 'INR'), `${locale} ${input}`).toBe(
        input.includes('1,000') ? 1000 : 170,
      )
    }
  }
  // "/-" is a rupee way of writing; it is not read as part of another currency's number.
  expect(parseNumber('170/-', 'en-SG', 'SGD')).toBeNull()
})

test('PR 701: digits in Devanagari and other Indian scripts read as numbers', () => {
  expect(parseNumber('१,०००', 'hi-IN', 'INR')).toBe(1000)
  expect(parseNumber('₹ १,००,०००', 'hi-IN', 'INR')).toBe(100000)
  expect(parseNumber('০.৫', 'bn-IN', 'INR', 'quantity')).toBe(0.5)
  expect(parseNumber('೧೫', 'kn-IN', 'INR')).toBe(15)
})

test('PR 701: a price written back into a field reads back the same in every locale', () => {
  for (const language of LOCALES) {
    for (const [currency, value] of [
      ['INR', 1000.5],
      ['SGD', 2.5],
      ['IDR', 15000],
      ['KWD', 1.125],
    ] as const) {
      const locale = moneyLocale(currency, language) ?? language
      const text = numberForEditing(value, locale, 'money', currency)
      expect(parseNumber(text, locale, currency), `${language} ${currency} ${text}`).toBe(value)
    }
  }
})
