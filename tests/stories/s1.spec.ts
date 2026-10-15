import { expect, test } from '@playwright/test'
import {
  closeSheet,
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
} from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Story evidence uses the phone project')
test('S1 · owner sets up and shares a shop', async ({ page, context }) => {
  test.setTimeout(90_000)
  await localOnly(page)
  await voiceFixture(page)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 12.9718234, longitude: 77.6412345, accuracy: 20 })
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
    await expect(page.getByRole('heading', { name: 'New shop', exact: true })).toBeVisible()
    await expect(page.getByText('New shop · step 1 of 4')).toBeVisible()
    await page.getByRole('button', { name: 'Use my current location' }).click()
    await expect(page.getByText('within 20 m')).toBeVisible()
    await page.screenshot({ path: 'docs/stories/new-shop-light.png', animations: 'disabled' })
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.screenshot({ path: 'docs/stories/new-shop-dark.png', animations: 'disabled' })
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Light', exact: true }).click()
    await page.keyboard.press('Escape')
    await tryVoice(page, 1)
    await page.getByRole('button', { name: 'Attach a photo or document' }).click()
    await expect(page.getByRole('menuitem', { name: 'Take photo' })).toBeVisible()
    await shot(page, 1, 3)
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Photo library' }).click()
    await (await chooser).setFiles(await image(page))
  })
  await test.step('4 · review name, category, price, unit and grouping', async () => {
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
    await page.getByRole('button', { name: 'Review my new shop' }).click()
    const review = page.getByRole('dialog', { name: reviewName })
    await expect(review).toContainText('New shop · step 4 of 4')
    await expect(review).toContainText('Your location')
    await expect(review).toContainText('within 20 m')
    await expect(review).toContainText('12.97182, 77.64123')
    await expect(review).toContainText('Offline Fixture Tea Stall')
    await expect(review).toContainText('Chai')
    await expect(review).toContainText('₹15.00 / cup')
    // The decision surface itself says what the reader was unsure of, or that it was a fixture.
    await expect(review.getByRole('alert')).toContainText('From your photo — please check')
    await expect(review.getByRole('alert')).toContainText(
      'Offline fixture: no model read this photo.',
    )
    await shot(page, 1, 4)
    await page.screenshot({
      path: 'docs/stories/new-shop-review-light.png',
      animations: 'disabled',
    })
    await confirm(page)
    await expect(page.getByText('Your new shop is ready', { exact: true })).toBeVisible()
    await page.screenshot({ path: 'docs/stories/new-shop-ready.png', animations: 'disabled' })
  })
  await test.step('5 · My shop readiness and next action', async () => {
    await page.getByRole('button', { name: 'My shop', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Readiness/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Customer page/ })).toBeVisible()
    await shot(page, 1, 5)
    await page.getByRole('button', { name: /^Readiness/ }).click()
    await expect(page.getByRole('button', { name: 'Edit details' })).toBeVisible()
    await closeSheet(page)
  })
  await test.step('6 · local location, opening/closing hours, UPI and delivery', async () => {
    await page.getByRole('button', { name: /^Shop details/ }).click()
    await page.getByRole('button', { name: 'Edit details' }).click()
    await page.getByLabel('Set hours by weekday').check()
    await page.getByLabel('Opens', { exact: true }).fill('07:00')
    await page.getByLabel('Closes', { exact: true }).fill('20:00')
    const payment = page.getByRole('combobox', { name: 'Payment', exact: true })
    await payment.fill('UPI')
    await payment.press('Enter')
    const delivery = page.getByRole('combobox', { name: 'Delivery', exact: true })
    await delivery.fill('Swiggy')
    await delivery.press('Enter')
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    const review = page.getByRole('dialog', { name: reviewName })
    await expect(review).toContainText('UPI')
    await expect(review).toContainText('Swiggy')
    await expect(review).toContainText('07:00')
    await expect(review).toContainText('within 20 m')
    await expect(review).toContainText('12.97182, 77.64123')
    liveOnly('Location, microphone ASR and camera capture still need a physical phone')
    await shot(page, 1, 6)
    await confirm(page)
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await page.locator('#coach input[type="file"]').setInputFiles(gpsBoardPath)
    await expect(page.getByRole('dialog', { name: reviewName })).toContainText('Chai')
    await shot(page, 1, '6-photo-pin')
    await confirm(page)
    await expect(page.getByRole('button', { name: 'Review photo location' })).toHaveCount(0)
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
    await expect(customer.getByRole('heading', { name: 'Offline Fixture Tea Stall' })).toBeVisible()
    await expect(customer.getByRole('listitem').filter({ hasText: 'Chai' })).toContainText('₹15.00')
    await expect(customer.getByText('UPI', { exact: true })).toBeVisible()
    await shot(customer, 1, '7-customer')
  })
})
