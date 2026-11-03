import { expect, test } from '@playwright/test'
import { LOCALES } from '../src/i18n/locales.js'
import { parseCloseDayNumber } from '../src/features/closeday/parseNumber.js'

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
      expect(parseCloseDayNumber(input, locale), input).toBe(expected)
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
      '₹1,000',
      '1000 rupees',
      '1 000',
      '1,,000',
      '1..000',
      `1${group}00`,
      `1${group}0000`,
      `1${decimal}2${decimal}3`,
      `1${decimal}`,
      `1${decimal}000${group}50`,
      '9007199254740992',
    ]) {
      expect(parseCloseDayNumber(input, locale), input).toBeNull()
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
      expect(parseCloseDayNumber(input, locale), input).toBe(expected)
    }
    for (const input of ['1,00', '1,0,000', '100,00', '1,00,00', '1.000,50']) {
      expect(parseCloseDayNumber(input, locale), input).toBeNull()
    }
  })
}

for (const locale of ['id', 'vi']) {
  test(`OB-279: ${locale} keeps a decimal comma distinct from grouping`, () => {
    expect(parseCloseDayNumber('1,000', locale)).toBe(1)
    expect(parseCloseDayNumber('1.000', locale)).toBe(1000)
    expect(parseCloseDayNumber('1000.50', locale)).toBeNull()
    expect(parseCloseDayNumber('1.00.000', locale)).toBeNull()
  })
}
