import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

const en = {
  banner: 'Simulated — no Google listing is created or changed',
  start: 'Put my shop on Google (simulation)',
  title: 'Google owner journey (simulation)',
  close: 'Close and keep progress',
  continue: 'Continue',
  loading: 'Loading saved simulation…',
  failed: 'Could not complete this action. Reload saved progress and try again.',
  reload: 'Reload saved progress',
  reviewer: 'Reviewer controls',
  scenario: 'Reviewer: scenario',
  reset: 'Reset simulation for this shop',
  scenarioHelp: 'Fixtures only. Reset keeps real shop facts, inventory and your customer page.',
  type: 'How do you serve customers?',
  types: {
    store: 'Customers visit',
    service: 'I visit customers (service area)',
    online: 'Online only',
  },
  facts: 'Reuse saved facts',
  reused:
    'Saved shop facts are reused below. Add only missing destination details. These edits affect the simulation only.',
  fields: {
    name: 'Shop name',
    location: 'Address',
    hours: 'Hours',
    phone: 'Contact',
    website: 'Website (optional)',
    service_area: 'Public service area',
    category_id: 'Google category fixture',
    region: 'Category region',
  },
  categories: {
    hawker_stall: 'Hawker stall',
    cafe: 'Café',
    bakery: 'Bakery',
    grocery: 'Grocery store',
  },
  regions: { SG: 'Singapore', JP: 'Japan' },
  chooseCategory: 'Choose a supported category',
  privateAddress:
    'Private address hidden — only the service area appears in the simulated public preview.',
  permission: 'Choose the Google account that manages this business',
  fictionalAccount:
    'Fictional account picker — no password or Google OAuth. App sign-in does not establish business rights.',
  account: 'Demo owner account (fictional)',
  wrongAccount: 'Wrong demo account (fictional)',
  cancel: 'Cancel authorization',
  search: 'Choose a matching fictional listing',
  noMatches: 'No fixture matches. Review a new listing before approving creation.',
  newListing: 'Create a new simulated listing',
  management: {
    you: 'Managed by you (simulated)',
    other: 'Managed by another owner (simulated)',
    unclaimed: 'Unclaimed (simulated)',
  },
  claim: 'Request simulated ownership',
  ownership: 'Ownership request (simulated)',
  ownershipStatuses: {
    none: 'Not requested',
    pending: 'Pending — no ownership granted',
    rejected: 'Rejected — draft preserved',
    granted: 'Granted (simulated)',
  },
  grant: 'Reviewer: grant ownership',
  rejectClaim: 'Reviewer: reject ownership',
  review: 'Review the exact simulated listing',
  local: 'Checked locally — not validated by Google',
  revision: 'Preview revision',
  operations: {
    create: 'Create (simulated)',
    update: 'Update managed listing (simulated)',
    claim: 'Claim (simulated)',
  },
  destination: 'Destination: Google Business Profile simulator',
  selected: 'Selected fictional listing',
  edit: 'Edit simulation facts',
  approve: 'Approve this revision and simulate submission',
  rejectField: 'Reviewer: reject hours on submission',
  pending: 'Submission pending — outcome unknown',
  reconcileHelp:
    'Retry first reconciles the existing fictional request. It never creates a second listing.',
  reconcile: 'Reconcile and retry',
  receipt: 'Fictional receipt',
  submissions: 'Simulated submissions',
  verify: 'Choose an offered verification method',
  methods: {
    sms: 'SMS (fictional)',
    email: 'Email (fictional)',
    phone: 'Phone (fictional)',
    postcard: 'Postcard (fictional)',
    pin: 'PIN (fictional)',
    automatic: 'Automatic (fixture only)',
  },
  methodHelp: {
    sms: 'Demo SMS code; no message is sent.',
    email: 'Demo email code; no email is sent.',
    phone: 'Demo phone code; no call is made.',
    postcard: 'Demo postcard code; no mail is sent.',
    pin: 'Demo PIN; no real verification code is collected.',
    automatic: 'Automatic verification belongs only to this fixture.',
  },
  code: 'Fictional code',
  codeHelp: 'Use the fictional fixture code 123456. Never enter a real code.',
  verifyCode: 'Check fictional code',
  resend: 'Start a new fictional code attempt',
  noMethods:
    'This scenario offers no verification methods. Progress stays pending; use the official owner handoff for real help.',
  video: 'Video verification preparation (simulation)',
  checklist: [
    'Prepare a view of the business location.',
    'Prepare signage and evidence you manage the business.',
    'Follow the methods offered in Google’s official owner UI.',
  ],
  rehearse: 'Mark preparation checklist complete',
  cancelRehearsal: 'Cancel preparation',
  prepared: 'Preparation complete — verification still pending. Nothing was recorded or uploaded.',
  handoff: 'Official Google owner handoff (separate)',
  result: 'Simulation result',
  verification: 'Verification (simulated)',
  verificationStatuses: {
    unverified: 'Unverified (simulated)',
    pending: 'Pending (simulated)',
    verified: 'Verified (simulated)',
  },
  publication: 'Publication (simulated)',
  publicationStatuses: {
    not_submitted: 'Not submitted (simulated)',
    pending: 'Pending (simulated)',
    restricted: 'Restricted (simulated)',
  },
  independent:
    'Your customer page and approved inventory are independent. Inventory prices are not synchronized to Google.',
  ineligible:
    'Online-only businesses are ineligible in this fixture. Your independent customer page and catalogue remain useful; do not invent an address.',
  reauthorize:
    'Simulated permission expired. Choose the fictional management account again; saved progress remains.',
  reverification:
    'Address or category changed — would need re-verification. Previous verification does not validate this revision.',
  disconnect: 'Disconnect simulated management',
  removal: 'Simulated management removal',
  removalStatuses: {
    connected: 'Connected (simulated)',
    pending: 'Removal pending — simulated queued changes stopped',
    confirmed: 'Removal confirmed (simulated)',
  },
  confirmRemoval: 'Reviewer: confirm removal',
  keepsListing: 'The merchant keeps their listing. No real permission or ownership is removed.',
  errors: {
    category: 'Choose a category supported in this region. Free text is not a Google category ID.',
    missing: 'Add the missing name, address or service area, hours and contact.',
    account:
      'Wrong fictional account. Your saved draft is preserved; choose the management account again.',
    wrong_code: 'Wrong fictional code. Try 123456 for this attempt.',
    expired_code: 'Fictional code expired. Start a new code attempt, then use 123456.',
    field_hours:
      'Hours rejected (simulated). Correct hours and review a new revision before submitting again.',
  },
}

type Copy = typeof en
/** Native simulator translations per locale (English source; missing keys fall back). */
export const simTranslations: Partial<Record<Locale, Partial<Copy>>> = {}

export function useSimCopy(): Copy {
  return { ...en, ...simTranslations[useLocale()] }
}
