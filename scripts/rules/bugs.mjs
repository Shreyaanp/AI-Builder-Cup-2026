// Rule 9 (warn only): a fix/ branch should reference the issue it fixes.
import { readFileSync, existsSync } from 'node:fs'

export const id = 'bugs'

export function run() {
  const branch = process.env.GITHUB_HEAD_REF || ''
  if (!branch.startsWith('fix/')) return { failures: [] }
  let body = ''
  const path = process.env.GITHUB_EVENT_PATH
  if (path && existsSync(path))
    body = JSON.parse(readFileSync(path, 'utf8')).pull_request?.body ?? ''
  if (/\b(fixes|closes|resolves)\s+#\d+/i.test(body)) return { failures: [] }
  return {
    failures: [],
    warnings: [
      `rule bugs: branch ${branch} fixes a bug but the PR description has no "Fixes #n". ` +
        `How to fix: find or file the issue and add "Fixes #<number>" to the description.`,
    ],
  }
}
