import { expect, test } from '@playwright/test'
import { formatPrice, formatShopPrice } from '../src/features/v1/format.js'

test('whole rupees drop the .00 and real paise stay', () => {
  expect(formatShopPrice(12000, 'INR', 'en-IN')).toBe('₹120')
  expect(formatShopPrice(1750, 'INR', 'en-IN')).toBe('₹17.50')
})

test('rupees use Indian grouping', () => {
  expect(formatShopPrice(123456700, 'INR', 'en-IN')).toBe('₹12,34,567')
  expect(formatShopPrice(12000000, 'INR', 'en-IN')).toBe('₹1,20,000')
})

test('other currencies are unchanged', () => {
  expect(formatShopPrice(150, 'SGD', 'en-SG')).toBe('S$1.50')
  expect(formatShopPrice(200, 'SGD', 'en-SG')).toBe('S$2.00')
  expect(formatShopPrice(15000, 'IDR', 'id-ID')).toBe(formatPrice(15000, 'IDR', 'id-ID'))
})
