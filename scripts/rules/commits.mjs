// Rule 1: commits carry no AI trailers.
import { git, baseCommit } from './lib.mjs'

export const id = 'commits'
const BAD = /co-authored-by:|generated with|🤖/i

export function run() {
  const base = baseCommit()
  if (!base) return { failures: [], note: 'no base commit (running on main): skipped' }
  const log = git('log', '--format=%H%x1f%B%x1e', `${base}..HEAD`)
  const failures = []
  for (const entry of log.split('\x1e')) {
    const [sha, body] = entry.trim().split('\x1f')
    if (!sha || !body) continue
    const hit = body.split('\n').find((l) => BAD.test(l))
    if (hit) failures.push(`${sha.slice(0, 8)}: "${hit.trim()}"`)
  }
  return {
    failures: failures.length
      ? [
          `rule commits: commit messages in this PR carry AI trailers (Co-Authored-By / Generated with). ` +
            `How to fix: reword with \`git rebase -i\` / \`git commit --amend\` and drop the trailer.`,
          ...failures.map((f) => `  ${f}`),
        ]
      : [],
  }
}
