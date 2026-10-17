// Rule 4: every English key exists in all locales, and TSX shows no bare English literals.
import ts from 'typescript'
import { basename, dirname } from 'node:path'
import { tracked, read, overBaseline, counts } from './lib.mjs'

export const id = 'i18n'
const LOCALES = [
  'zh-Hans',
  'ms',
  'ta',
  'ja',
  'ko',
  'id',
  'th',
  'vi',
  'fil',
  'hi',
  'bn',
  'te',
  'mr',
  'kn',
]
const ALL = ['en', ...LOCALES]

const nameOf = (p) =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null

/** Dotted key paths of an object literal; null when it uses spreads or computed keys we cannot read. */
function keysOf(obj, prefix = '') {
  const out = []
  for (const p of obj.properties) {
    const named =
      ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isShorthandPropertyAssignment(p)
    const name = named ? nameOf(p) : null
    if (name === null) return null
    const path = prefix + name
    out.push(path)
    if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) {
      const inner = keysOf(p.initializer, path + '.')
      if (inner === null) return null
      out.push(...inner)
    }
  }
  return out
}

function localeTables(file) {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const tables = []
  const visit = (n) => {
    if (ts.isObjectLiteralExpression(n)) {
      const byLocale = new Map()
      for (const p of n.properties) {
        const name = ts.isPropertyAssignment(p) ? nameOf(p) : null
        if (name && ALL.includes(name)) byLocale.set(name, p.initializer)
      }
      if (byLocale.size >= 3)
        tables.push({ byLocale, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1 })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return tables
}

/** A table that holds locale objects: each locale must carry every key the reference has. */
function scanTables() {
  const found = {}
  const files = tracked('src/**/*.ts', 'src/**/*.tsx').filter((f) => !/\.d\.ts$/.test(f))
  for (const f of files) {
    for (const t of localeTables(f)) {
      const keyed = new Map()
      for (const [loc, init] of t.byLocale) {
        if (!ts.isObjectLiteralExpression(init)) continue
        const k = keysOf(init)
        if (k) keyed.set(loc, new Set(k))
      }
      if (keyed.size < 3) continue
      const ref = keyed.has('en')
        ? keyed.get('en')
        : new Set([...keyed.values()].flatMap((s) => [...s]))
      const hits = found[f] ?? (found[f] = [])
      for (const loc of LOCALES) {
        if (!t.byLocale.has(loc)) {
          hits.push(`${t.line}: locale ${loc} missing from table`)
          continue
        }
        const have = keyed.get(loc)
        if (!have) continue
        for (const key of ref) if (!have.has(key)) hits.push(`${t.line}: ${loc} lacks "${key}"`)
      }
      if (!hits.length) delete found[f]
    }
  }
  return found
}

/** Locale folders (one file per language) must hold every non-English locale. */
function scanFolders() {
  const dirs = new Map()
  for (const f of tracked('src/**/locales/*.ts')) {
    const d = dirname(f)
    if (!dirs.has(d)) dirs.set(d, [])
    dirs.get(d).push(basename(f, '.ts'))
  }
  const found = {}
  for (const [d, names] of dirs) {
    const present = new Set(names.filter((n) => LOCALES.includes(n)))
    if (present.size < 3) continue
    const missing = LOCALES.filter((l) => !present.has(l))
    if (missing.length) found[d] = missing.map((l) => `0: no ${l}.ts in locale folder`)
  }
  return found
}

const ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label'])
const looksEnglish = (s) =>
  /^[\s\W]*[A-Za-z][A-Za-z'’-]*(\s+[A-Za-z][A-Za-z'’,.!?-]*)+[\s\W]*$/.test(s.trim())

/** Heuristic: JSX text and text-like attributes with two or more plain English words. */
function scanLiterals() {
  const found = {}
  for (const f of tracked('src/features/**/*.tsx')) {
    const sf = ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const hits = []
    const add = (n, text) =>
      hits.push(
        `${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: "${text.trim().replace(/\s+/g, ' ').slice(0, 60)}"`,
      )
    const visit = (n) => {
      if (ts.isJsxText(n)) {
        if (looksEnglish(n.text)) add(n, n.text)
      } else if (
        ts.isJsxAttribute(n) &&
        n.initializer &&
        ts.isStringLiteral(n.initializer) &&
        ATTRS.has(n.name.getText())
      ) {
        if (looksEnglish(n.initializer.text)) add(n, n.initializer.text)
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
    if (hits.length) found[f] = hits
  }
  return found
}

export function run({ baseline }) {
  const keys = scanTables()
  for (const [d, hits] of Object.entries(scanFolders())) keys[d] = hits
  const literals = scanLiterals()
  const fmt = (o) => [
    `  ${o.file} (baseline ${o.allowed}, now ${o.hits.length})`,
    ...o.hits.slice(0, 20).map((h) => `    ${h}`),
  ]
  const failures = []
  const k = overBaseline('i18n-keys', keys, baseline)
  if (k.length)
    failures.push(
      `rule i18n: a locale is missing keys the English copy has. People read the app in 15 languages, and a ` +
        `missing key shows English or nothing. How to fix: add the key (translated) to every locale in the table or folder.`,
      ...k.flatMap(fmt),
    )
  const l = overBaseline('i18n-literals', literals, baseline)
  if (l.length)
    failures.push(
      `rule i18n: user-visible English literal in a src/features component (heuristic). ` +
        `How to fix: move the text into the feature's copy/strings module with all locales and read it through the locale hook.`,
      ...l.flatMap(fmt),
    )
  return { counts: { 'i18n-keys': counts(keys), 'i18n-literals': counts(literals) }, failures }
}
