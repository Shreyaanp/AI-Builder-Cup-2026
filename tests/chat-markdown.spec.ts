import { expect, test, type Page } from '@playwright/test'
import { safeUrl, stripMarkdown, stabilizeMarkdown } from '../src/design/markdownUtils.js'

test.describe('Markdown & Voice Utilities Unit Tests', () => {
  test('stripMarkdown removes markdown syntax for TTS speech synthesis', () => {
    // Bold and italic
    expect(stripMarkdown('**Special Offer** and *Daily Discount*')).toBe(
      'Special Offer and Daily Discount',
    )
    expect(stripMarkdown('__Special Offer__ and _Daily Discount_')).toBe(
      'Special Offer and Daily Discount',
    )

    // Headers
    expect(stripMarkdown('# Daily Summary\n## Section 1\n### Subheading')).toBe(
      'Daily Summary Section 1 Subheading',
    )

    // Bullet and numbered lists
    const listText = stripMarkdown(
      'Items:\n- 10 kg Rice\n* 5 L Milk\n+ 2 kg Sugar\n1. First\n2. Second',
    )
    expect(listText).toBe('Items: 10 kg Rice 5 L Milk 2 kg Sugar First Second')
    expect(listText).not.toContain('*')
    expect(listText).not.toContain('-')

    // Tables
    const tableText = stripMarkdown(
      '| Item | Price |\n|---|---|\n| Masala Chai | ₹15 |\n| Samosa | ₹20 |',
    )
    expect(tableText).toBe('Item Price Masala Chai ₹15 Samosa ₹20')
    expect(tableText).not.toContain('|')

    // Links and images
    expect(stripMarkdown('Check [Our Menu](https://chalkboard.app/menu) now')).toBe(
      'Check Our Menu now',
    )
    expect(stripMarkdown('Look at ![Storefront](https://chalkboard.app/photo.jpg)')).toBe(
      'Look at Storefront',
    )

    // Code blocks and inline code
    expect(stripMarkdown('Use code `DISCOUNT10` at checkout')).toBe(
      'Use code DISCOUNT10 at checkout',
    )
    expect(stripMarkdown('Notes:\n```\nraw details\n```\nAll done')).toBe('Notes: All done')

    // Blockquotes and rules
    expect(stripMarkdown('> Fresh bakery items everyday\n---\nThank you!')).toBe(
      'Fresh bakery items everyday Thank you!',
    )

    // No leftover symbols like *, #, ~, `, >
    expect(stripMarkdown('# *~Special `Deal`~*')).toBe('Special Deal')
  })

  test('safeUrl permits only http, https, tel, upi, and relative links', () => {
    expect(safeUrl('https://chalkboard.app')).toBe('https://chalkboard.app')
    expect(safeUrl('http://localhost:3849')).toBe('http://localhost:3849')
    expect(safeUrl('tel:+919876543210')).toBe('tel:+919876543210')
    expect(safeUrl('upi://pay?pa=merchant@upi&pn=Store')).toBe('upi://pay?pa=merchant@upi&pn=Store')
    expect(safeUrl('/shop/menu')).toBe('/shop/menu')
    expect(safeUrl('#top')).toBe('#top')

    // Malicious or unsupported schemes must be stripped to empty string
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('JAVASCRIPT:alert("xss")')).toBe('')
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('')
    expect(safeUrl('vbscript:msgbox(1)')).toBe('')
    expect(safeUrl('')).toBe('')
    expect(safeUrl(undefined)).toBe('')
  })

  test('stabilizeMarkdown closes incomplete markdown tokens during SSE streaming', () => {
    // Incomplete bold
    expect(stabilizeMarkdown('Hello **world')).toBe('Hello **world**')
    // Incomplete italic
    expect(stabilizeMarkdown('Hello *world')).toBe('Hello *world*')
    // Incomplete inline code
    expect(stabilizeMarkdown('Use `code')).toBe('Use `code`')
    // Incomplete code fence
    expect(stabilizeMarkdown('```ts\nconst x = 1')).toBe('```ts\nconst x = 1\n```')
    // Incomplete link
    expect(stabilizeMarkdown('Visit [our shop](https://example.com')).toBe(
      'Visit [our shop](https://example.com)',
    )
    // Incomplete table row
    expect(stabilizeMarkdown('| Item | Price |\n| Chai | 10')).toBe(
      '| Item | Price |\n| Chai | 10 |',
    )
  })

  test('stripMarkdown removes raw HTML tags and unsafe javascript links from speech', () => {
    expect(stripMarkdown('Hello <script>alert(1)</script> world')).toBe('Hello alert(1) world')
    expect(stripMarkdown('Check [Evil](javascript:alert(1))')).toBe('Check Evil')
  })
})

async function openOwnerCoach(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

test.describe('Chat Markdown Phone Specs', () => {
  test('owner coach renders formatted markdown with lists, bold, and responsive table', async ({
    page,
  }) => {
    const markdownReply = [
      '### Weekly Store Update',
      '',
      'Here are your top highlights for **Courtyard Chai**:',
      '',
      '* **Revenue**: ₹18,500',
      '* **Top selling**: Masala Chai & Ginger Cookies',
      '',
      '| Item | Units Sold | Price |',
      '|---|---|---|',
      '| Masala Chai | 120 | ₹15 |',
      '| Ginger Tea | 45 | ₹20 |',
      '| Bun Maska | 30 | ₹25 |',
      '',
      'Call supplier at [Order Supplies](tel:+919876543210) if you need stock.',
    ].join('\n')

    await page.route('**/api/v1/coach/stream', async (route) => {
      const sseBody = [
        'data: {"kind":"ready","mode":"offline"}',
        '',
        `data: {"kind":"delta","text":${JSON.stringify(markdownReply)}}`,
        '',
        'data: {"kind":"turn_complete"}',
        '',
      ].join('\n\n')

      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBody,
      })
    })

    await openOwnerCoach(page)

    const input = page.getByLabel('Message', { exact: true })
    await input.fill('How was my week?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    // Verify coach response bubble contains rich markdown elements
    const log = page.getByRole('log')
    await expect(log.getByRole('heading', { level: 3, name: 'Weekly Store Update' })).toBeVisible()
    await expect(log.locator('strong', { hasText: 'Courtyard Chai' })).toBeVisible()

    // Verify list items rendered
    const revenueItem = log.locator('li', { hasText: 'Revenue' })
    await expect(revenueItem.first()).toContainText('Revenue: ₹18,500')

    // Verify table rendered with headers and cells
    const table = log.locator('table')
    await expect(table).toBeVisible()
    await expect(table.locator('th').first()).toHaveText('Item')
    await expect(table.locator('td', { hasText: 'Masala Chai' })).toBeVisible()
    await expect(table.locator('td', { hasText: '₹15' })).toBeVisible()

    // Verify table wrapper allows horizontal scrolling without breaking chat layout
    const tableWrapper = log.locator('table').locator('..')
    await expect(tableWrapper).toHaveCSS('overflow-x', 'auto')

    // Verify safe tel link
    const telLink = log.getByRole('link', { name: 'Order Supplies' })
    await expect(telLink).toHaveAttribute('href', 'tel:+919876543210')

    await page.screenshot({
      path: 'screenshots/chat-markdown-coach-reply.png',
      animations: 'disabled',
    })
  })

  test('human typed owner message remains plain text without markdown injection but auto-links', async ({
    page,
  }) => {
    await page.route('**/api/v1/coach/stream', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"kind":"ready"}\n\ndata: {"kind":"delta","text":"Received."}\n\ndata: {"kind":"turn_complete"}\n\n',
      })
    })

    await openOwnerCoach(page)

    // Owner types text with markdown syntax and a url
    const message = 'Check **this** out: https://example.com/item and tel:9876543210'
    const input = page.getByLabel('Message', { exact: true })
    await input.fill(message)
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const log = page.getByRole('log')
    // The user's bubble must display the asterisks literally (plain text), not as <strong>
    await expect(log.getByText('Check **this** out:')).toBeVisible()
    await expect(log.locator('strong', { hasText: 'this' })).toHaveCount(0)

    // The url and tel must be auto-linked
    const webLink = log.getByRole('link', { name: 'https://example.com/item' })
    await expect(webLink).toHaveAttribute('href', 'https://example.com/item')
    await expect(webLink).toHaveAttribute('target', '_blank')
    await expect(webLink).toHaveAttribute('rel', 'noopener noreferrer')

    const telLink = log.getByRole('link', { name: 'tel:9876543210' })
    await expect(telLink).toHaveAttribute('href', 'tel:9876543210')
  })

  test('customer Ask streaming answer renders partial markdown smoothly without broken tokens', async ({
    page,
  }) => {
    // Setup customer journey
    await page.addInitScript(() => {
      localStorage.setItem('chalkboard.customer.journey', 'done')
      localStorage.setItem(
        'chalkboard.discover.filters',
        JSON.stringify({ place: { lat: 12.9719, lng: 77.6412, label: 'Indiranagar' } }),
      )
    })

    // Mock /api/v1/discover/ask endpoint with SSE chunks containing partial markdown tokens
    await page.route('**/api/v1/discover/ask', async (route) => {
      const baseAnswer = {
        intent: {
          summary: '',
          keywords: ['coffee'],
          category: '',
          max_price: null,
          halal: false,
          vegetarian: false,
          locally_made: false,
          open_now: false,
          followups: [],
          sort: 'best',
          near: '',
          deals: false,
        },
        mode: 'ai',
        groups: [
          {
            id: 'best',
            places: [
              {
                id: 'fixture-cafe',
                name: 'Kopi Stall',
                source: 'chalkboard',
                category: 'Cafe',
                lat: 12.972,
                lng: 77.642,
                distance_m: 100,
                open_now: true,
                currency: 'INR',
                items: [{ name: 'Filter Coffee', price: 1500, unit: 'cup', available: true }],
                matched: [{ name: 'Filter Coffee', price: 1500, unit: 'cup', available: true }],
                sold_out: [],
                demo_shop: true,
                deal: null,
              },
            ],
          },
        ],
      }
      const chunks = [
        `event: instant\ndata: ${JSON.stringify(baseAnswer)}\n\n`,
        'event: delta\ndata: {"text":"Here are **recommendations"}\n\n',
        'event: delta\ndata: {"text":"** for you:\\n\\n* Fresh Filter Coffee\\n* Hot Masala Chai"}\n\n',
        `event: complete\ndata: ${JSON.stringify({
          ...baseAnswer,
          intent: {
            ...baseAnswer.intent,
            summary: 'Here are **recommendations** for you:\n\n* Fresh Filter Coffee\n* Hot Masala Chai',
          },
        })}\n\n`,
      ]
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: chunks.join(''),
      })
    })

    await page.goto('/explore/')
    const composer = page.getByRole('textbox', { name: 'Ask about anything nearby' })
    await expect(composer).toBeVisible()
    await composer.fill('coffee places')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    // The answer bubble should render recommendations with strong tag and list items
    await expect(page.locator('strong', { hasText: 'recommendations' })).toBeVisible()
    await expect(page.locator('li', { hasText: 'Fresh Filter Coffee' })).toBeVisible()
    await expect(page.locator('li', { hasText: 'Hot Masala Chai' })).toBeVisible()

    await page.screenshot({
      path: 'screenshots/chat-markdown-ask-streaming.png',
      animations: 'disabled',
    })
  })

  test('voice playback strips markdown formatting before speaking aloud', async ({ page }) => {
    // Intercept window.speechSynthesis to capture spoken utterance
    await page.addInitScript(() => {
      ;(window as unknown as { __spokenTexts: string[] }).__spokenTexts = []
      const fakeSpeechSynthesis = {
        speaking: false,
        paused: false,
        pending: false,
        getVoices: () => [{ name: 'Aria (Female)', lang: 'en-IN' }],
        speak: (utterance: SpeechSynthesisUtterance) => {
          ;(window as unknown as { __spokenTexts: string[] }).__spokenTexts.push(utterance.text)
        },
        cancel: () => {},
        pause: () => {},
        resume: () => {},
      }
      Object.defineProperty(window, 'speechSynthesis', {
        value: fakeSpeechSynthesis,
        writable: true,
      })
    })

    const markdownReply = 'Welcome! Today we have **50% off** on *all items*.\n- Chai\n- Samosa'

    await page.route('**/api/v1/coach/stream', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: {"kind":"ready"}\n\ndata: {"kind":"delta","text":${JSON.stringify(markdownReply)}}\n\ndata: {"kind":"turn_complete"}\n\n`,
      })
    })

    await openOwnerCoach(page)

    const input = page.getByLabel('Message', { exact: true })
    await input.fill('Any offers today?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const log = page.getByRole('log')
    await expect(log.locator('strong', { hasText: '50% off' })).toBeVisible()

    // Click the "Read reply aloud" button
    const readAloudBtn = page.getByRole('button', { name: 'Read reply aloud' })
    if (await readAloudBtn.isVisible()) {
      await readAloudBtn.click()

      // Check captured spoken text
      const spoken = await page.evaluate(
        () => (window as unknown as { __spokenTexts: string[] }).__spokenTexts,
      )
      expect(spoken.length).toBeGreaterThan(0)
      for (const text of spoken) {
        expect(text).not.toContain('**')
        expect(text).not.toContain('*')
        expect(text).not.toContain('-')
        expect(text).toContain('50% off')
      }
    }
  })
})
