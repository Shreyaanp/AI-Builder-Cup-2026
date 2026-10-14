import { mkdirSync, writeFileSync } from 'node:fs'
const root = new URL('../public/art/', import.meta.url)
mkdirSync(root, { recursive: true })
const art = {
  kopi: [
    '#efd6b6',
    '#d8efc2',
    '<path d="M270 250h200v130a70 70 0 0 1-70 70h-60a70 70 0 0 1-70-70z"/><path d="M470 270h30a45 45 0 0 1 0 90h-30M310 180v35m60-55v55m60-35v35M250 470h280"/>',
  ],
  bakery: [
    '#edcdaa',
    '#f5e6a4',
    '<path d="M220 370c0-110 360-160 360-40 0 75-65 110-180 110s-180-10-180-70z"/><path d="M320 295l30 70m50-90l30 70m50-80l30 70"/>',
  ],
  hawker: [
    '#fac2a9',
    '#e5d5f1',
    '<path d="M210 300h380c-20 110-85 160-190 160s-170-50-190-160zM270 490h260M320 180v65m80-85v85m80-65v65"/>',
  ],
  grocery: [
    '#d7e9af',
    '#b2dacd',
    '<path d="M260 270h280l-30 220H290zM330 270v-45a70 70 0 0 1 140 0v45"/><path d="M360 340v80m80-80v80"/>',
  ],
  catering: [
    '#cbd8f5',
    '#e8c9df',
    '<path d="M230 420h340M250 395a150 150 0 0 1 300 0zM380 225v-30h40v30M215 465h370"/>',
  ],
}
for (const [name, [a, b, drawing]] of Object.entries(art))
  writeFileSync(
    new URL(`category-${name}.svg`, root),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><path fill="url(#g)" d="M0 0h800v600H0z"/><circle cx="650" cy="100" r="160" fill="#ffffff" opacity=".25"/><circle cx="100" cy="550" r="170" fill="#ffffff" opacity=".2"/><g fill="none" stroke="#243e31" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">${drawing}</g></svg>\n`,
  )
writeFileSync(
  new URL('chalkboard.svg', root),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" rx="32" fill="#dcf4a3"/><ellipse cx="300" cy="524" rx="192" ry="24" fill="#1e382b" opacity=".15"/><g transform="rotate(-8 300 300)"><path d="M164 452l-24 60m306-60l24 60" stroke="#7b5438" stroke-width="22"/><rect x="116" y="86" width="370" height="394" rx="20" fill="#7b5438"/><rect x="132" y="102" width="338" height="362" rx="10" fill="#1e382b"/><g fill="none" stroke="#dcf4a3" stroke-width="12" stroke-linecap="round"><path d="M176 156h228M176 204h150M180 278h126v66a35 35 0 0 1-35 35h-56a35 35 0 0 1-35-35zM306 289h20a28 28 0 0 1 0 56h-20M358 284h50m-50 46h36M176 416h228"/></g></g><circle cx="484" cy="126" r="44" fill="#efd6b6"/><path d="M469 126l11 11 20-24" fill="none" stroke="#1e382b" stroke-width="8" stroke-linecap="round"/></svg>\n`,
)
