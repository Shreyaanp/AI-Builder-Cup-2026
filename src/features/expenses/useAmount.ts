import { useLocale } from '../../state/hooks'
import { moneyLocale } from '../../region/region'
import { exponent, formatShopPrice, toMinor } from '../v1/format'
import { readNumber } from '../v1/readNumber'
import { moneyCopyFor } from './copy'

/** What a typed amount reads as: its value, or the words that explain the problem. */
export function useAmount(text: string, currency: string) {
  const locale = useLocale()
  const m = moneyCopyFor(locale)
  const numberLocale = moneyLocale(currency, locale) ?? locale
  const reading = readNumber(text, numberLocale, currency, 'money')
  const show = (value: number) => formatShopPrice(toMinor(value, currency), currency, locale)
  const example = new Intl.NumberFormat(numberLocale).format(
    exponent(currency) === 0 ? 1000 : 1000.5,
  )
  const problem = reading.ok
    ? ''
    : reading.reason === 'empty'
      ? ''
      : reading.reason === 'ambiguous'
        ? m.amountQuestion(show(reading.options[0]), show(reading.options[1]))
        : m.amountExample(example)
  return {
    value: reading.ok ? reading.value : null,
    empty: !reading.ok && reading.reason === 'empty',
    problem,
    /** The amount as it will be saved ("= ₹1,00,000"), so a slip shows before Save. */
    preview: reading.ok ? `= ${show(reading.value)}` : '',
    example: m.amountExample(example),
  }
}
