// Synthetic fixture renderer. Uses installed Playwright; no server or network.
import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases')
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
  await page.route('**/*', (route) => route.abort())
  for (const name of (await fs.readdir(root)).sort()) {
    const folder = path.join(root, name)
    const spec = JSON.parse(await fs.readFile(path.join(folder, 'case.json'), 'utf8'))
    if (!spec.render) continue
    const { title, variant, items } = spec.render
    const filter =
      variant === 'low-light'
        ? 'brightness(.48) contrast(.85)'
        : variant === 'rotated'
          ? 'blur(.65px)'
          : 'none'
    const transform = variant === 'rotated' ? 'rotate(2deg)' : 'none'
    const symbol = spec.currency === 'SGD' ? 'S$' : '₹'
    const rows = items
      ? items
          .map(
            (r, i) =>
              `<tr><td>${escape(r.name)}<small>${escape(r.category)} · ${escape(r.size)}${i === 1 ? ' · SOLD OUT' : ''}</small></td><td>${symbol}${(r.price / 100).toFixed(2)}</td></tr>`,
          )
          .join('')
      : '<tr><td>Sugar · 2 kg</td><td>₹100.00</td></tr><tr><td>Tax (5%)</td><td>₹5.00</td></tr><tr><td>Total</td><td>₹105.00</td></tr>'
    const html = `<!doctype html><meta charset="utf-8"><style>@page { size: A4; margin: 0; } body{margin:0;background:#ddd;font-family:"Nirmala UI","Microsoft YaHei",sans-serif;color:#222}main{margin:60px;padding:40px;background:#fff;min-height:540px;filter:${filter};transform:${transform}}h1{font-size:32px}p,small{font-size:18px}small{display:block;color:#555}table{width:100%;border-collapse:collapse;font-size:26px}td{padding:22px 4px;border-bottom:1px solid #aaa}td:last-child{text-align:right;white-space:nowrap}</style><main><p>SYNTHETIC TEST DOCUMENT</p><h1>${escape(title)}</h1>${items ? '' : '<p>Test Wholesale<br>18 October 2026 · INV-GOLD-001</p>'}<table>${rows}</table></main>`
    await fs.writeFile(path.join(folder, 'source.html'), html)
    await page.setContent(html)
    // eslint-disable-next-line no-undef -- runs in the page, not Node
    await page.evaluate(() => document.fonts.ready)
    if (spec.mime === 'application/pdf') {
      await page.pdf({ path: path.join(folder, spec.input), printBackground: true })
    } else {
      await page.screenshot({ path: path.join(folder, spec.input) })
    }
  }
} finally {
  await browser.close()
}
