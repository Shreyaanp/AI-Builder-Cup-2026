import { expect, test } from '@playwright/test'

test('owner missing-fact prompts recognize food categories in every UI language and Hindi', async ({
  page,
}) => {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.goto('/')
  const results = await page.evaluate(async () => {
    const path = '/src/features/v1/shopProgress.tsx'
    const { missingFacts } = await import(path)
    return {
      food: [
        'Coffee',
        '餐馆',
        'kedai kopi',
        'உணவு',
        'カフェ',
        '음식',
        'warung makan',
        'อาหาร',
        'nhà hàng',
        'kainan',
        'dhaba',
        'चाय',
      ].map((category) => missingFacts({ category, name: 'Local business' })),
      nonFood: ['Pharmacy', 'Hardware store', 'Hair salon', 'Clothing store'].map((category) =>
        missingFacts({ category, name: 'Local business' }),
      ),
    }
  })
  for (const questions of results.food) expect(questions).toContain('halal')
  for (const questions of results.food) expect(questions).toContain('vegetarian_options')
  for (const questions of results.nonFood) expect(questions).not.toContain('halal')
})
