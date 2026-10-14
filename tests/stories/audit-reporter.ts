import { mkdirSync, writeFileSync } from 'node:fs'
import type { Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter'

/** Persist the actual numbered-step results and disclosures for the overnight audit. */
export default class StoryReporter implements Reporter {
  private steps = new Map<string, { title: string; status: string }[]>()
  private stories: object[] = []

  onTestBegin(test: TestCase) {
    this.steps.set(test.id, [])
  }

  onStepEnd(test: TestCase, _result: TestResult, step: TestStep) {
    if (!/^S[12357] ·/.test(test.title) || step.category !== 'test.step') return
    const steps = this.steps.get(test.id) ?? []
    steps.push({ title: step.title, status: step.error ? 'failed' : 'passed' })
    this.steps.set(test.id, steps)
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (!/^(S[12357]|A(?:3|4|6|8|9|11|12)) ·/.test(test.title) || result.status === 'skipped')
      return
    this.stories.push({
      story: test.title,
      project: test.parent.project()?.name,
      status: result.status,
      retry: result.retry,
      steps: this.steps.get(test.id) ?? [],
      annotations: test.annotations,
    })
  }

  onEnd() {
    if (!this.stories.length) return
    mkdirSync('docs/stories', { recursive: true })
    writeFileSync(
      process.env.STORY_STRICT === 'true'
        ? 'docs/stories/STRICT-RESULTS.json'
        : 'docs/stories/RESULTS.json',
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          mode: process.env.STORY_STRICT === 'true' ? 'strict' : 'audit',
          scope:
            '390×844 offline audit; annotated gaps and live-only paths are not verified story outcomes',
          stories: this.stories,
        },
        null,
        2,
      ) + '\n',
    )
  }
}
