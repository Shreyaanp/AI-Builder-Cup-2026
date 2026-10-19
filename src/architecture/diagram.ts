/**
 * What really runs in production, as one diagram. The single source for the /architecture page.
 * Checked against the live Cloud Run service, Cloud Armor, Scheduler and BigQuery on 18 Oct 2026.
 */

export interface ArchNode {
  id: string
  title: string
  detail: string
}

export interface ArchLane {
  id: string
  title: string
  nodes: ArchNode[]
}

export interface ArchEdge {
  from: string
  to: string
  label?: string
}

export const lanes: ArchLane[] = [
  {
    id: 'people',
    title: 'Phones',
    nodes: [
      {
        id: 'pwa',
        title: 'Chalkboard PWA',
        detail: 'React + TypeScript, owner and customer apps, 15 languages',
      },
      { id: 'auth', title: 'Firebase Auth', detail: 'Google sign-in, verified on the server' },
      {
        id: 'ga4',
        title: 'Google Analytics 4',
        detail: 'Consent-gated flow events, no personal data',
      },
    ],
  },
  {
    id: 'gateway',
    title: 'Edge',
    nodes: [
      {
        id: 'armor',
        title: 'HTTPS load balancer + Cloud Armor',
        detail: '300 requests a minute per IP, then 429',
      },
    ],
  },
  {
    id: 'run',
    title: 'Cloud Run ogoogle-ai (asia-south1)',
    nodes: [
      {
        id: 'api',
        title: 'FastAPI + React',
        detail: 'Stateless; 1 to 10 instances, 40 requests each; SSE text, WebSocket voice',
      },
      {
        id: 'understand',
        title: 'Business understanding',
        detail: 'Gemini profile of any business: kind, offer, never-ask list, extra questions',
      },
      {
        id: 'coach',
        title: 'ADK agent business_coach',
        detail: '34 tools; the same agent runs text (Gemini) and voice (Gemini Live)',
      },
      {
        id: 'onboard',
        title: 'Onboarding tools',
        detail:
          'update_shop, propose_business, suggest_starter_items, make_my_icon, end_conversation',
      },
      {
        id: 'shop',
        title: 'Shop coach tools',
        detail:
          'get_insights, get_forecast, get_shop_playbook, propose_products, propose_rescue_deal',
      },
      {
        id: 'supply',
        title: 'Supply tools',
        detail: 'get_supplier_rules, set_supplier_rules, draft_reorder, get_purchase_orders',
      },
      {
        id: 'sourcing',
        title: 'Sourcing tools',
        detail: 'find_suppliers, prepare_order, message_supplier, get_orders, cancel_order',
      },
      {
        id: 'ask',
        title: 'Customer ask',
        detail: 'Gemini reads the request; results only from real shop data and Google places',
      },
    ],
  },
  {
    id: 'face',
    title: 'Cloud Run ogoogle-face',
    nodes: [
      {
        id: 'faceworker',
        title: 'Private face worker',
        detail: 'Optional owner liveness check; OpenVINO + ONNX; 1 instance',
      },
    ],
  },
  {
    id: 'ai',
    title: 'Google AI',
    nodes: [
      {
        id: 'flash',
        title: 'Gemini 3.5 Flash',
        detail: 'Coach turns, structured output, menu and photo reading',
      },
      { id: 'live', title: 'Gemini Live 3.8', detail: 'Voice in and out, with the same tools' },
      { id: 'embed', title: 'gemini-embedding-2', detail: '768 dimensions, owner-scoped recall' },
      { id: 'docai', title: 'Document AI', detail: 'Expense and Invoice parsers for receipts' },
      { id: 'maps', title: 'Maps grounding + Places', detail: 'Gemini grounded in Google Maps' },
      {
        id: 'vision',
        title: 'Vision SafeSearch + Cloud TTS',
        detail: 'Photo checks; read-aloud voice',
      },
    ],
  },
  {
    id: 'data',
    title: 'Data',
    nodes: [
      {
        id: 'firestore',
        title: 'Firestore',
        detail: 'Shops, sessions, run leases, rate limits, vector recall',
      },
      {
        id: 'bq',
        title: 'BigQuery',
        detail: 'AI.FORECAST (TimesFM); chalkboard_analytics; billing_export',
      },
      { id: 'gcs', title: 'Cloud Storage', detail: 'Moderated shop photos, private bucket' },
      { id: 'secrets', title: 'Secret Manager', detail: 'Maps keys and the face-worker token' },
    ],
  },
  {
    id: 'ops',
    title: 'Operations',
    nodes: [
      {
        id: 'scheduler',
        title: 'Cloud Scheduler',
        detail: 'Nightly analytics export with OIDC (paused on 18 Oct)',
      },
      { id: 'logging', title: 'Cloud Logging sink', detail: 'API request logs into BigQuery' },
      {
        id: 'cicd',
        title: 'GitHub Actions CI/CD',
        detail: 'Checks on every PR; keyless (WIF) deploy of a tagged main commit',
      },
    ],
  },
]

export const edges: ArchEdge[] = [
  { from: 'pwa', to: 'armor', label: 'HTTPS, SSE, WebSocket' },
  { from: 'pwa', to: 'auth', label: 'sign in' },
  { from: 'pwa', to: 'ga4', label: 'after consent' },
  { from: 'armor', to: 'api' },
  { from: 'api', to: 'understand' },
  { from: 'understand', to: 'coach', label: 'questions and tools fit the business' },
  { from: 'api', to: 'coach' },
  { from: 'api', to: 'ask' },
  { from: 'coach', to: 'onboard' },
  { from: 'coach', to: 'shop' },
  { from: 'coach', to: 'supply' },
  { from: 'coach', to: 'sourcing' },
  { from: 'coach', to: 'flash' },
  { from: 'coach', to: 'live' },
  { from: 'understand', to: 'flash' },
  { from: 'ask', to: 'flash' },
  { from: 'ask', to: 'maps' },
  { from: 'api', to: 'docai', label: 'close the day' },
  { from: 'api', to: 'vision' },
  { from: 'api', to: 'embed' },
  { from: 'api', to: 'faceworker', label: 'optional, consented' },
  { from: 'api', to: 'firestore' },
  { from: 'embed', to: 'firestore', label: 'find_nearest' },
  { from: 'shop', to: 'bq', label: 'forecast' },
  { from: 'api', to: 'gcs' },
  { from: 'secrets', to: 'api' },
  { from: 'scheduler', to: 'api', label: 'export' },
  { from: 'api', to: 'bq', label: 'analytics' },
  { from: 'logging', to: 'bq' },
  { from: 'cicd', to: 'api', label: 'deploy' },
]

/** How the same product adapts to a helmet station, a tailor or a tea stall. */
export const adaptSteps: { title: string; detail: string }[] = [
  {
    title: 'Understand',
    detail:
      'The owner describes the business in their own words. Gemini writes a typed profile: product, service, food or mixed; what it offers; what customers ask; what never to ask.',
  },
  {
    title: 'Ask only what fits',
    detail:
      'Onboarding asks the core five (name, what, where, hours, photo) plus at most two extra questions from that profile. A helmet station is never asked "is it halal?".',
  },
  {
    title: 'Shape the shop',
    detail:
      'Item categories, starter items, units and the customer search group come from the profile and the owner’s words, not a fixed food template.',
  },
  {
    title: 'Coach with a playbook',
    detail:
      'A per-shop playbook (goals, key numbers, watch list, regulars, vocabulary) decides the Today page, the Grow cards and what the coach says. Owners can edit it.',
  },
]

/** Measured on 18 Oct 2026. */
export const scaleFacts: { value: string; label: string }[] = [
  { value: '0 errors', label: '9,428 requests, 50 users for 60 s, straight to Cloud Run' },
  { value: '155 /s', label: 'Requests served on the non-AI pages' },
  { value: '154 ms', label: 'Median response (p95 573 ms)' },
  { value: '2 → 4', label: 'Instances added by Cloud Run during the test' },
]

const quote = (text: string) => text.replaceAll('"', '#quot;')

/** The Mermaid flowchart, generated from the same data. */
export function toMermaid(): string {
  const lines = ['flowchart TD']
  for (const lane of lanes) {
    lines.push(`  subgraph ${lane.id}["${quote(lane.title)}"]`)
    for (const node of lane.nodes)
      lines.push(`    ${node.id}["${quote(node.title)}<br/>${quote(node.detail)}"]`)
    lines.push('  end')
  }
  for (const edge of edges)
    lines.push(
      edge.label
        ? `  ${edge.from} -->|${quote(edge.label)}| ${edge.to}`
        : `  ${edge.from} --> ${edge.to}`,
    )
  return lines.join('\n')
}
