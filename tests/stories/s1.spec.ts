import { expect, test } from '@playwright/test'
import {
  confirm,
  gpsBoardPath,
  image,
  liveOnly,
  localOnly,
  phone,
  reviewName,
  share,
  shot,
  tryVoice,
  voiceFixture,
  detailsStep,
  sortAsMenu,
} from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Story evidence uses the phone project')
test('S1 · owner sets up and shares a shop', async ({ page, context }) => {
  test.setTimeout(90_000)
  await localOnly(page)
  await voiceFixture(page)
  await test.step('1 · open the business entry', async () => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Your shop, online in one conversation' }),
    ).toBeVisible()
    await shot(page, 1, 1)
  })
  await test.step('2 · preview identity and explicit consent', async () => {
    liveOnly('Google sign-in and the hosted business domain are not exercised locally')
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    const agree = page.getByRole('button', { name: 'Agree and continue' })
    await expect(agree).toBeDisabled()
    await page.getByLabel('I agree to the Terms').check()
    await page.getByLabel('I have read the Privacy Notice').check()
    await shot(page, 1, 2)
    await agree.click()
  })
  await test.step('3 · photo path, text/voice alternatives', async () => {
    liveOnly(
      'Photo recognition and microphone ASR accuracy; uploaded image uses the real offline extraction fixture',
    )
    await expect(page.getByRole('button', { name: 'Press to talk' })).toBeVisible()
    await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
    await tryVoice(page, 1)
    await page.getByRole('button', { name: 'Attach a photo or document' }).click()
    await expect(page.getByRole('menuitem', { name: 'Take photo' })).toBeVisible()
    await shot(page, 1, 3)
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Photo library' }).click()
    await (await chooser).setFiles(await image(page))
  })
  await test.step('4 · review name, category, price, unit and grouping', async () => {
    const review = page.getByRole('dialog', { name: reviewName })
    await expect(review).toContainText('Offline Fixture Tea Stall')
    await expect(review).toContainText('Chai')
    await expect(review).toContainText('₹15.00 / cup')
    // The decision surface itself says what the reader was unsure of, or that it was a fixture.
    await expect(review.getByRole('alert')).toContainText('From your photo — please check')
    await expect(review.getByRole('alert')).toContainText(
      'Offline fixture: no model read this photo.',
    )
    await shot(page, 1, 4)
    await confirm(page)
  })
  await test.step('5 · Shop page, then Grow: what is missing for Google', async () => {
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await expect(page.getByRole('region', { name: 'This is your page' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Customer page/ })).toBeVisible()
    await shot(page, 1, 5)
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Get on Google.*missing/ })).toBeVisible()
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
  })
  await test.step('6 · local location, opening/closing hours, UPI and delivery', async () => {
    await page.getByRole('button', { name: /^Shop details/ }).click()
    await page.getByRole('button', { name: 'Edit details' }).click()
    // Edit details is one question per screen; the step row jumps to each.
    await detailsStep(page, 'Location')
    await page.getByLabel('Address or area').fill('Indiranagar, Bengaluru')
    await detailsStep(page, 'Hours')
    await page.getByLabel('Set hours by weekday').check()
    await page.getByLabel('Opens', { exact: true }).fill('07:00')
    await page.getByLabel('Closes', { exact: true }).fill('20:00')
    await detailsStep(page, 'Payment')
    const payment = page.getByRole('combobox', { name: 'Payment', exact: true })
    await payment.fill('UPI')
    await payment.press('Enter')
    await detailsStep(page, 'Delivery')
    const delivery = page.getByRole('combobox', { name: 'Delivery', exact: true })
    await delivery.fill('Swiggy')
    await delivery.press('Enter')
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    const review = page.getByRole('dialog', { name: reviewName })
    await expect(review).toContainText('UPI')
    await expect(review).toContainText('Swiggy')
    await expect(review).toContainText('07:00')
    await review.getByRole('button', { name: /Find.*pin/i }).click()
    // The offline map knows the demo neighbourhoods worldwide; the pin is labelled demo.
    await expect(review).toContainText(/: Indiranagar ·/)
    await expect(review.getByRole('alert')).toHaveCount(0)
    liveOnly('Photo GPS capture needs a physical phone')
    await shot(page, 1, 6)
    await confirm(page)
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await page.locator('#coach input[type="file"]').setInputFiles(gpsBoardPath)
    await sortAsMenu(page)
    await expect(page.getByRole('dialog', { name: reviewName })).not.toContainText(
      '12.97180, 77.64120',
    )
    await shot(page, 1, '6-photo-pin')
    await confirm(page)
    await page.getByRole('button', { name: 'Review photo location' }).click()
    await expect(page.getByRole('dialog', { name: reviewName })).toContainText('12.97180, 77.64120')
    await confirm(page)
    await page.getByLabel('Message', { exact: true }).fill('Halal: yes')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('dialog', { name: reviewName })).toContainText('Halal')
    await shot(page, 1, '6-facts')
    await confirm(page)
  })
  await test.step('7 · share link and QR connect to the customer menu', async () => {
    const url = await share(page)
    await shot(page, 1, 7)
    const customer = await context.newPage()
    await localOnly(customer)
    await customer.goto(url)
    await expect(
      customer.getByRole('heading', { level: 1, name: 'Offline Fixture Tea Stall' }),
    ).toBeVisible()
    // The menu comes before the similar-nearby list, which can hold a same-named chai from other runs.
    await expect(customer.getByRole('listitem').filter({ hasText: /^Chai/ }).first()).toContainText(
      /₹15(?![.0-9])/,
    )
    await expect(customer.getByText('UPI', { exact: true })).toBeVisible()
    await shot(customer, 1, '7-customer')
  })
})
