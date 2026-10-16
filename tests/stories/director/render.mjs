import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { stories } from './catalog.mjs'

const marker = '<!-- TRACK-R-CONTRACTS -->'
const original = await readFile('STORIES.md', 'utf8')
const prior = original.split(marker)[0].trimEnd()
const escape = (value) => value.replaceAll('|', '/').replaceAll('\n', ' ')
const contracts = stories
  .map(
    (s) =>
      `### ${s.id.toUpperCase()} · ${s.title}\n\n**Persona:** ${s.persona}. **Trigger:** ${s.trigger}. **Fix area:** ${s.area}.\n\n${s.steps.map((step, i) => `${i + 1}. ${step}.`).join('\n')}\n\n| Screen | Loading | Empty | Error | Offline | Success |\n| --- | --- | --- | --- | --- | --- |\n${s.screens.map((sc) => `| ${[sc.name, sc.loading, sc.empty, sc.error, sc.offline, sc.success].map(escape).join(' | ')} |`).join('\n')}\n\n**One motion moment:** ${s.motion}\n\n**Emotional beat:** ${s.emotion}\n\n**Hand-off:** ${s.next}\n\n**Acceptance checks:**\n\n${s.checks.map((c) => `- [ ] ${c}.`).join('\n')}\n\n**Evidence:** [phone/light](docs/stories/director/${s.id}/phone-light/run.json), [phone/dark](docs/stories/director/${s.id}/phone-dark/run.json), [desktop/light](docs/stories/director/${s.id}/desktop-light/run.json), [desktop/dark](docs/stories/director/${s.id}/desktop-dark/run.json). These describe the recorded subset; unchecked acceptance items are intentions.\n`,
  )
  .join('\n')
await writeFile(
  'STORIES.md',
  `${prior}\n\n${marker}\n\n## Track R · owner and customer story contracts (16 October 2026)\n\nThis section is the current acceptance contract. Earlier dated status entries above remain historical evidence. It does not mark a story complete. The walker reports partial paths and blocked entries honestly; [scorecard](docs/qa/story-scorecard.md) records what actually ran. S1–S7 retain their IDs; S8–S21 make the newer owner/customer/supplier journeys explicit. Weekly recap, menu import, shop switching and guided tour are subjourneys of S10/S15, S2/S18 and S1; owner messages are the other side of S3. Install is optional in S7.\n\n### Shared acceptance for every screen\n\n- Phone 390×844 and desktop 1440×1000; both appearances. Each matrix cell below is a required state, not a claim that fault injection tested it.\n- Keyboard, meaningful labels/headings, focus return, ≥48px product touch targets, safe areas, 200% text, 320px reflow and locale-appropriate typography.\n- One primary action and at most one meaningful motion moment; reduced motion preserves the same information and controls.\n- Loading preserves context; empty names the next action; error/offline preserve drafts and give recovery; success requires acknowledgement. No silent edits, publication, order transmission or payment.\n- Demo/model/identity/authority/liveness/publishing statuses stay distinct. No synthetic fixture proves live ASR, Gemini accuracy or biometric matching.\n- No end-to-end completion until the next story receives the correct saved context and all required state/device checks are recorded.\n\n${contracts}`,
)

const variants = ['phone-light', 'phone-dark', 'desktop-light', 'desktop-dark']
const rows = []
for (const s of stories)
  for (const variant of variants) {
    try {
      rows.push(
        JSON.parse(await readFile(`docs/stories/director/${s.id}/${variant}/run.json`, 'utf8')),
      )
    } catch {
      /* Missing evidence is reported below. */
    }
  }
const sha = rows[0]?.sha || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
await mkdir('docs/qa', { recursive: true })
await mkdir('docs/briefs', { recursive: true })
const designScores = {
  s1: [3, 3, 3, 4, 3],
  s2: [3, 4, 3, 4, 3],
  s3: [3, 4, 3, 3, 3],
  s4: [3, 3, 3, 4, 3],
  s5: [3, 4, 3, 4, 3],
  s6: [3, 4, 2, 4, 4],
  s7: [2, 3, 2, 4, 3],
  s8: [2, 3, 3, 4, 3],
  s10: [2, 3, 2, 4, 3],
  s15: [3, 4, 3, 4, 4],
  s16: [2, 3, 2, 4, 3],
}
const findings = {
  s1: [
    'P1',
    'Make onboarding entry points lead into one name-first full-screen journey',
    'src/features/v1/screens/ShopScreen.tsx:94; src/features/v1/EditDialogs.tsx; onboarding branch',
    'Empty My shop currently offers the existing editor/photo path. Route +, tour end and empty state to the guided journey, preserve the draft on Back, and offer Type instead on mic errors. Do not change review approval semantics.',
  ],
  s2: [
    'P2',
    'Reduce competing preamble above the daily edit',
    'src/features/v1/screens/CoachScreen.tsx:708; src/features/coach/InputDock.tsx:161',
    'The phone transcript starts below progress, readiness and daily-check surfaces. Collapse redundant setup/readiness once the shop exists; keep the daily check dismissible and the edited values in view. Preserve the current successful two-change review.',
  ],
  s3: [
    'P1',
    'Restore valid list semantics in the shared conversation log',
    'src/features/inquiries/ConversationView.tsx:47 and :135; shared customer/owner conversation area',
    'The owner reply checkpoint reports serious axe listitem violations. The ordered-list container has role=log, which replaces its list semantics while its children remain li. Put a real ordered list inside a named log wrapper (or another correctly announced transcript pattern) and preserve chronological reading order. Re-run both owner and customer thread checkpoints, keyboard reply and live announcements. Draft/send-retry and Back restoration remain separate acceptance checks; identity gating already works in the local fixture.',
  ],
  s4: [
    'P2',
    'Keep supplier comparison readable without crowding the composer',
    'src/features/v1/screens/CoachScreen.tsx:708; src/features/sourcing/SourcingCards.tsx; src/features/sourcing/Orders.tsx',
    'On phone, readiness and daily-check blocks reduce supplier-card space and a horizontal next-card preview clips content by design. Prioritize the supplier choice and one concise explanation; preserve reachable Send. Add an explicit receipt hand-off rather than treating Confirmed as restocked.',
  ],
  s5: [
    'P1',
    'Contain Google step motion without expanding the mobile viewport',
    'src/features/v1/screens/GoogleScreen.tsx:182; transition wrapper and cbStepFromRight/Left definitions',
    'Phone recordings are 390×844 raster, but the CSS layout viewport expands to 405–406px on checklist, preview and hand-off checkpoints in both themes; photos and the final reduced-motion checkpoint return to 390px. The translateX step entrances are the leading source hypothesis, not a proven root cause. Reproduce at animation start/middle/end; constrain the transition layer without clipping focus outlines, then verify the CSS viewport stays 390px and controls do not shrink. Preserve the truthful Google access/owner-submission boundary.',
  ],
  s6: [
    'P1',
    'Verify optional identity and partial erasure recovery independently',
    'src/features/v1/screens/PrivacyScreen.tsx:70; src/features/v1/FaceDialog.tsx',
    'Cancel, failed request, named pending stores (injected partial receipt), retry and public removal are recorded. Complete the optional-identity slice: worker failure leaves Skip reachable and ordinary editing usable, without changing authority/publishing status. Separately verify a real local partial-store failure, since the partial receipt here is injected.',
  ],
  s7: [
    'P2',
    'Review localized display text and fallbacks at large text',
    'src/i18n/fonts.ts:29; src/design/theme.ts:132; src/features/passport/TodayDeck.tsx:240',
    'Tamil UI and optional install dismissal are recorded. Tamil phone checkpoints measure a 391×847 CSS layout viewport inside 390×844 raster evidence in both themes. Reproduce the small expansion after Settings closes before attributing it to glyph metrics or tooltip overflow. Compare Tamil/Hindi/Bengali/Japanese at 200% and 320px; preserve script marks and wrapping rather than shrinking controls.',
  ],
  s8: [
    'P1',
    'Explain stamps and prove reward eligibility before celebration',
    'src/features/rewards/StampCard.tsx; src/features/passport/StampMoment.tsx; src/features/passport/Passport.tsx:46',
    'Put scan location, threshold, storage scope and reward terms before the first celebration. Provide keyboard/tap equivalent for scratch/drag. Do not label unsigned device progress as verified visits. Add duplicate/reload and eligible/ineligible reward walks.',
  ],
  s9: [
    'P1',
    'Expose one complete rescue-to-collection route',
    'src/features/passport/TodayDeck.tsx; customer rescue worker',
    'The main navigation boundary does not establish an owner-posted offer → customer hold → collection. Connect this one route with honest demo labels, real expiry and availability, sign-in at hold, explicit owner confirmation, and one idempotent collection reward.',
  ],
  s10: [
    'P1',
    'Connect a useful rich coach answer to one next action',
    'src/features/v1/CoachChart.tsx; src/features/forecast/PrepPlan.tsx; src/features/v1/screens/CoachScreen.tsx',
    'The recorded no-history boundary cannot establish a morning brief or rich analysis. Use synthetic history to show conclusion, units, method/range and accessible text summary. One next action should lead to supplier/menu context; insufficient data stays honest.',
  ],
  s11: [
    'P1',
    'Make aggregated demand an actionable, discoverable journey',
    'src/features/v1/ShopTiles.tsx; My shop demand worker',
    'Provide a named Asked nearby entry, period/radius and banded counts, then one relevant reviewed menu/sourcing proposal. No raw asks or customer identities. Verify sparse, stale, failed and offline data.',
  ],
  s12: [
    'P2',
    'Expose a neutral comparable-price review',
    'src/features/shop/MenuSheet.tsx; My shop price worker',
    'Add a contextual comparison entry only where supported. Show comparable unit/currency, sample size and demo count; insufficient data stays empty. Any price change uses the existing approval boundary.',
  ],
  s13: [
    'P2',
    'Finish group-buy close into an individually approved order',
    'supply-chain worker; sourcing Orders',
    'Expose a group invitation and own quantity, show deadline/tier terms, and require explicit own-order approval at close. A missed tier must offer fallback/cancel. Do not collect money.',
  ],
  s14: [
    'P2',
    'Provide supplier context and aggregate-only demand',
    'supply-chain worker; My shop supplier view',
    'A supplier should deliberately enter supplier mode, see only eligible aggregates, and review offer terms before sending. Add empty/threshold/offline paths and link incoming orders.',
  ],
  s15: [
    'P2',
    'Connect the saved day to tomorrow without adding a dashboard',
    'src/features/closeday/CloseDay.tsx; src/features/planning/PlanTomorrow.tsx',
    'After Day closed, offer one contextual tomorrow/prep action with actual day/units and insufficient-history explanation. Verify zero versus unknown and partial-save retry; preserve idempotency.',
  ],
  s16: [
    'P2',
    'Finish follow and moderation recovery as a short return loop',
    'src/features/customer/FollowButton.tsx; src/features/customer/Saved.tsx; src/features/customer/Tips.tsx',
    'Record follow/unfollow acknowledgement and rollback, useful empty Saved recovery, pending/rejected/approved tip and delete. Keep source/demo labels and avoid an endless generic feed.',
  ],
  s17: [
    'P1',
    'Make agent availability and accepted holds visibly distinct',
    'customer concierge worker; src/features/public/CustomerConversation.tsx',
    'Expose a concrete item/quantity/deadline request. Display shop-sourced freshness and partial failures, then exact user approval and owner acceptance/rejection. A recommendation or demo reply never means a confirmed hold.',
  ],
  s18: [
    'P1',
    'Join connector mapping, diff and import receipt',
    'connector worker; existing import review',
    'Expose Connect your system, inspect one synthetic export, highlight uncertain required fields and units, then review a diff before import. Record malformed/no-op/duplicate import outcomes. No live ERP connection is needed for this fix.',
  ],
  s19: [
    'P1',
    'Demonstrate one linked simulated supply-chain document loop',
    'supply-chain worker',
    'Start with rules and an owner-approved PO; carry IDs through response, ASN and invoice; surface uncertainty, shortage/substitution/partial and match status. Receipt remains separate from order confirmation and financial settlement. Use synthetic SAP XML/JSON samples.',
  ],
  s20: [
    'P1',
    'Expose Features and AI examples without hidden execution',
    'src/features/v1/AppShell.tsx:68; Features worker',
    'Main navigation still names Google. Complete a Features entry with Google as one capability and concrete AI examples. Preview must not execute a tool. Payment/rider hand-offs show exact recipient/amount/provider and leave the external transaction to that provider.',
  ],
  s21: [
    'P1',
    'Show measured impact with inspectable methodology',
    'trust/impact worker',
    'Expose an Impact entry with dated numerator/denominator, dataset, fixture/live status and local evidence links. Empty/unmeasured values must say so; projected benefits must not resemble observed traction.',
  ],
}
const table = []
const attentionRows = []
for (const s of stories) {
  const runs = rows.filter((r) => r.id === s.id),
    blocked = runs.some((r) => r.status === 'blocked'),
    failed = runs.some((r) => r.status === 'failed')
  const score = blocked ? [1, 2, 1, 3, 3] : designScores[s.id] || [1, 2, 1, 3, 3]
  const status = !runs.length
    ? 'UNRECORDED'
    : failed
      ? 'EXECUTION FAILURE'
      : blocked
        ? 'ENTRY BLOCKED'
        : runs.some((r) => r.status === 'partial')
          ? 'PARTIAL'
          : 'RECORDED SUBSET'
  const screens = runs.flatMap((r) => r.evidence)
  const counts = `${runs.length}/4 variants; ${screens.length} screens; ${screens.reduce((n, e) => n + e.accessibilityViolations, 0)} axe rule occurrences; ${screens.filter((e) => e.overflow).length} overflow screens`
  const evidence = `[runs](../stories/director/${s.id}/phone-light/run.json) · [video](../stories/director/${s.id}/phone-light/walk.webm)`
  table.push(
    `| ${s.id.toUpperCase()} ${s.title} | ${score.join(' | ')} | ${status}: ${counts}. ${evidence} |`,
  )
  const [priority, title, location, brief] = findings[s.id]
  const phone = runs.find((run) => run.variant === 'phone-light')
  const keyScreen = phone?.evidence
    .filter((e) => !e.name.startsWith('90-') && !e.name.startsWith('99-'))
    .at(-1)
  if (keyScreen) {
    const stem = `${s.id}/phone-light/${keyScreen.name}`
    const metric = JSON.parse(await readFile(`docs/stories/director/${stem}.json`, 'utf8'))
    attentionRows.push(
      `| ${s.id.toUpperCase()} ${keyScreen.name} | ${metric.visibleElements} / ${metric.elementsPer100kPixels} | ${metric.competingAccents} | ${metric.spacingOn4pxRhythm ?? 'n/a'} | ${metric.contrast.violations.length} / ${metric.contrast.manualReview.length} | [screen](../stories/director/${stem}.png) · [heatmap](../stories/director/${stem}-heatmap.svg) · [metrics](../stories/director/${stem}.json) |`,
    )
  }
  const gaps = [...new Set(runs.flatMap((r) => r.gaps))]
  await writeFile(
    `docs/briefs/fix-${s.id}.md`,
    `# ${s.id.toUpperCase()} · ${title}\n\nOwner area: **${s.area}**. Dispatcher: the assistant. Priority: **${priority}**. Scope: one area; Track R changes no product code.\n\n## Evidence and limits\n\nBaseline \`${sha}\`; ${status.toLowerCase()}. ${counts}. [Phone run](../stories/director/${s.id}/phone-light/run.json), [video](../stories/director/${s.id}/phone-light/walk.webm), [contract](../../STORIES.md#${s.id}--${s.title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replaceAll(
        ' ',
        '-',
      )}).\n\n${gaps.map((g) => `- ${g}`).join('\n') || 'The recorded happy-path subset does not validate the entire state matrix.'}\n\n## Smallest fix / next proof\n\n${brief}\n\nLocate: ${location}. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.\n\n## Acceptance\n\n${s.checks.map((c) => `- [ ] ${c}.`).join('\n')}\n- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.\n- [ ] Link before/after evidence; do not count a fixture as live accuracy.\n\n## Boundary\n\nDo not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.\n`,
  )
}
await writeFile(
  'docs/qa/story-scorecard.md',
  `# Track R · story scorecard\n\nBaseline: locally cached origin/main \`${sha}\`. Generated from per-variant run.json files; no fetch or PR-status lookup. [Method and findings](../research/ux-2026.md), [contracts](../../STORIES.md), [recording index](../stories/director/README.md).\n\nScores are provisional director assessments of the **recorded subset**, not acceptance passes or user-study results. 1 = absent/blocked; 2 = fragmentary; 3 = usable with material gaps; 4 = coherent within observed scope; 5 = full contract and recovery/device evidence. Eye strain is reverse burden: 5 = calm/readable, 1 = taxing. An entry-boundary eye-strain/consistency score applies only to its visible host screen. Missing feature motion scores 1 even when host navigation animates. No story receives 5 because the full state/device matrix is unvalidated.\n\nColumns: completeness, clarity, immersion/motion, consistency, eye strain. Counts report **rule occurrences per screenshot**, not distinct defects; zero means only no automated violation found at that checkpoint. Manual contrast/incomplete results remain in each screen JSON.\n\n| Story | Complete | Clear | Immersion | Consistent | Eye strain | Recorded evidence |\n| --- | --- | --- | --- | --- | --- | --- |\n${table.join('\n')}\n\n## Interpretation\n\n- \`walked\` records only implemented assertions in the script. \`partial\` records a known contract gap. \`blocked\` records an entry/adaptor boundary. \`failed\` records an assertion/automation failure, not an automatic product-bug diagnosis.\n- Approval, Google hand-off and on-phone progress are assessed independently of external publication, real OAuth, verified visit or live ASR.\n- Existing dated regression claims in STORIES.md were not reclassified as fresh passes. Track R does not modify production source or dispatch fixes directly.\n- PR branches were not re-run: their current open/merged status cannot be established without contacting an external service, which this task restricts. Locally cached refs are not proof of open PRs.\n\n## Open release evidence\n\nAll contract cells need targeted loading/empty/error/offline/success runs; this first pass records happy paths and selected boundaries. Physical phone camera/mic/IME, real assistive technology, 200% text/320px reflow, Indic/CJK coverage, real Google sign-in, provider accuracy, face matching and cross-story data hand-offs remain outside these fixture recordings. Follow the individual [fix briefs](../briefs/) before declaring a story complete.\n`,
)
const scorecard = await readFile('docs/qa/story-scorecard.md', 'utf8')
const attention = `## Attention / density checkpoints

One representative phone/light checkpoint per story; all other checkpoints have the same triplet alongside their run. Density is visible semantic boxes / boxes per 100k pixels; accents are chromatic-background hue bins; rhythm is the share of sampled positive padding/gaps aligned to 4px; contrast is automated violations / incomplete checks needing review. These are diagnostics, not universal pass thresholds or measured attention.

| Story / checkpoint | Elements / density | Accents | 4px rhythm | Contrast / manual | Evidence |
| --- | --- | --- | --- | --- | --- |
${attentionRows.join('\n')}

`
let verificationSummary = ''
try {
  const verified = JSON.parse(await readFile('docs/stories/director/verification.json', 'utf8'))
  const ruleOccurrences = verified.accessibilityFindings.reduce((n, f) => n + f.rules.length, 0)
  verificationSummary = `## Artifact verification and open observations

${verified.runs} variant videos and ${verified.screens} screenshot/metric/heatmap triplets were checked; ${verified.failures} script execution failures. ${verified.blocked} variant paths stop at missing-entry boundaries (10 stories), not completed product journeys. [Machine-readable verification](../stories/director/verification.json).

The checkout now follows cached main \`${verified.checkoutSha}\`; its product/dependency/server/test trees compare identically to recording baseline \`${verified.sha}\`. The intervening commits change documentation and house skills. See the [house-rule review](director-house-checklist.md).

- ${verified.viewportDrift} CSS layout-viewport expansions are retained: Google phone checkpoints reach 405–406px wide and Tamil reaches 391px inside the configured 390×844 raster. The old document-scrollWidth check misses this mobile rescaling. See S5/S7 briefs. The transition relationship is a hypothesis needing start/middle/end reproduction; do not silently normalize dimensions.
- ${ruleOccurrences} automated accessibility rule occurrences: four persistent owner-transcript listitem findings (S3), plus two light My shop Weekly recap contrast observations (S14/S20 host screens). The latter have different blended foregrounds (3.05:1 / 4.39:1) and may be entrance-phase effects; stable-state verification is still required before attributing them to the palette.
- ${verified.manualContrastChecks} incomplete contrast checks require manual review; zero automated violations elsewhere is not an accessibility sign-off. Stills finish finite animation for capture, while the live DOM audit can observe a different transition phase. Videos preserve ordinary motion.
- The alias-host run inspects generated sharing links without following them; direct customer routes are tested. Real generated-share-link hand-off remains unvalidated.

`
} catch {
  /* First render can precede verification. */
}
await writeFile(
  'docs/qa/story-scorecard.md',
  scorecard.replace('## Interpretation', `${attention}${verificationSummary}## Interpretation`),
)
console.log(
  `Rendered ${stories.length} contracts, ${stories.length} briefs, scorecard from ${rows.length} variant runs.`,
)
