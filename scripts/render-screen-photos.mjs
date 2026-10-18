// Offline golden inputs. These are synthetic pictures, never OCR accuracy evidence.
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../backend/tests/fixtures/screen-photos/', import.meta.url))
const cases = [
  {
    key: 'tally',
    app: 'Tally',
    kind: 'screen',
    color: '#fff3b5',
    rows: [['Filter Coffee', 'FC01', 'Drinks', '30', '2', '2026-10-17', '60']],
  },
  {
    key: 'excel',
    app: 'Excel',
    kind: 'screen',
    color: '#e2f0d9',
    rows: [
      ['Masala Dosa', 'MD01', 'Food', '80', '', '', ''],
      ['Cut-off item', '', '', '35', '', '', ''],
    ],
  },
  {
    key: 'petpooja',
    app: 'Petpooja',
    kind: 'screen',
    color: '#ffe2de',
    rows: [['Mango Lassi', 'ML01', 'Drinks', '65', '', '', '']],
  },
  {
    key: 'printed',
    app: null,
    kind: 'clean_print',
    color: '#fff',
    rows: [['Idli', 'ID01', 'Food', '40', '3', '2026-10-17', '120']],
  },
]
const fields = ['name', 'sku', 'category', 'price', 'qty', 'date', 'total']
const fixtureIndex = {}
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
})
try {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 780 },
    offline: true,
  })
  const page = await context.newPage()
  await page.route('**/*', (route) => route.abort())
  for (const sample of cases) {
    const directory = `${root}/${sample.key}`
    mkdirSync(directory, { recursive: true })
    const html = `<!doctype html><meta charset="utf-8"><title>${sample.app || 'Printed receipt list'}</title>
<style>
body{margin:0;background:#373330;font:22px Arial;perspective:1400px;padding:85px 55px}
.monitor{position:relative;background:${sample.color};border:24px solid #181818;border-radius:16px;
padding:28px;transform:rotateY(-9deg) rotateX(7deg) rotateZ(-2deg);filter:blur(.35px);overflow:hidden;
box-shadow:12px 22px 20px #0008;min-height:440px}
h1{font-size:28px}table{border-collapse:collapse;width:100%;font-size:19px}td,th{border:1px solid #999;padding:12px;text-align:left}
.moire,.glare{position:absolute;inset:0;pointer-events:none}
.moire{background:repeating-linear-gradient(3deg,#0002 0px,transparent 1px,transparent 3px);opacity:.38}
.glare{background:linear-gradient(125deg,transparent 40%,#fff9 62%,transparent 80%)}
.cutoff{position:absolute;right:0;bottom:85px;width:300px;height:52px;background:#fff;opacity:.95}
${sample.key === 'excel' ? 'tbody tr:last-child td:nth-child(4){color:transparent;background:#fff}' : ''}
</style><section class="monitor"><h1>${sample.app || 'Printed receipt list'} — INR</h1>
<table><thead><tr>${fields.map((field) => `<th>${field}</th>`).join('')}</tr></thead><tbody>
${sample.rows.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join('')}</tr>`).join('')}
</tbody></table>${sample.key === 'excel' ? '<div class="cutoff"></div>' : ''}
<div class="moire"></div><div class="glare"></div></section>`
    writeFileSync(`${directory}/source.html`, html)
    await page.setContent(html)
    const image = await page.screenshot({ path: `${directory}/photo.png` })
    const reading = {
      source_app: sample.app,
      currency: 'INR',
      page_kind: sample.kind,
      tables: [
        {
          header_row: fields,
          rows: sample.rows.map((row, index) =>
            Object.fromEntries(
              fields.map((field, col) => [
                field,
                {
                  value:
                    sample.key === 'excel' && index === 1 && field === 'price'
                      ? null
                      : row[col] || null,
                  confidence: row[col] ? 0.98 : 0,
                  unreadable: sample.key === 'excel' && index === 1 && field === 'price',
                },
              ]),
            ),
          ),
        },
      ],
    }
    if (sample.key === 'excel') reading.tables[0].rows[1].price.confidence = 0.2
    writeFileSync(`${directory}/expected.json`, JSON.stringify(reading, null, 2) + '\n')
    fixtureIndex[createHash('sha256').update(image).digest('hex')] = reading
  }
  const fixtureDir = fileURLToPath(new URL('../backend/app/fixtures/', import.meta.url))
  mkdirSync(fixtureDir, { recursive: true })
  writeFileSync(`${fixtureDir}/screen_photos.json`, JSON.stringify(fixtureIndex, null, 2) + '\n')
} finally {
  await browser.close()
}
