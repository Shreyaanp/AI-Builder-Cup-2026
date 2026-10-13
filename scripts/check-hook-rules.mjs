import assert from 'node:assert/strict'
import { ESLint } from 'eslint'

// Negative examples ensure the selected rulebook has executable enforcement.
const eslint = new ESLint()
const invalid = [
  [
    'conditional hook',
    "import {useState} from 'react'; export function Broken({enabled}:{enabled:boolean}) { if(enabled) useState(0); return null; }",
    'react-hooks/rules-of-hooks',
  ],
  [
    'stale effect',
    "import {useEffect} from 'react'; export function Broken({value}:{value:string}) { useEffect(()=>{document.title=value}, []); return null; }",
    'react-hooks/exhaustive-deps',
  ],
]
for (const [name, code, rule] of invalid) {
  const [result] = await eslint.lintText(code, { filePath: 'src/HookFixture.tsx' })
  assert(
    result.messages.some((message) => message.ruleId === rule),
    `${name} was not caught`,
  )
}
const [valid] = await eslint.lintText(
  "import {useEffect} from 'react'; export function Correct({value}:{value:string}) { useEffect(()=>{document.title=value}, [value]); return null; }",
  { filePath: 'src/HookFixture.tsx' },
)
assert.equal(valid.errorCount + valid.warningCount, 0)
console.log(
  'Hook enforcement passed: conditional hook and stale effect rejected; valid effect accepted.',
)
