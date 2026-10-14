/**
 * DRAFT legal texts for the AI Builder Cup prototype. They are written to follow India's Digital
 * Personal Data Protection Act, 2023 and DPDP Rules, 2025, but have NOT been reviewed by a lawyer.
 * Bump LEGAL_VERSION (and the backend's LEGAL_VERSION) whenever the text changes.
 */
export const LEGAL_VERSION = '2026-10-14'
export const GRIEVANCE_CONTACT = 'Grievance contact: to be published before public launch'

export interface LegalSection {
  heading: string
  body: string[]
}

export const TERMS: LegalSection[] = [
  {
    heading: 'What oGoogle AI is',
    body: [
      'oGoogle AI is an independent prototype that helps small-business owners prepare and maintain their business information. It is not a Google product and is not endorsed by Google.',
      'It does not publish anything to Google. When you are ready, it hands you a checklist and Google’s own official page, where Google verifies you separately.',
    ],
  },
  {
    heading: 'Your responsibilities',
    body: [
      'Only add businesses you own or are authorised to manage, and only information that is true.',
      'Do not upload photos of people, documents, or anything explicit, violent or unlawful. Photos are checked automatically and rejected photos are not stored.',
    ],
  },
  {
    heading: 'How changes are saved',
    body: [
      'The assistant can only suggest changes. Nothing is saved until you review the exact details and confirm them yourself.',
      'AI suggestions can be wrong. Check prices, hours and phone numbers before you confirm.',
    ],
  },
  {
    heading: 'Prototype limits',
    body: [
      'This is a hackathon prototype. It may change, be unavailable or be discontinued, and it is provided without warranties to the extent the law allows.',
      'You can stop using it at any time and delete all your data from the Privacy tab.',
    ],
  },
]

export const PRIVACY: LegalSection[] = [
  {
    heading: 'What we collect',
    body: [
      'Your Google account identifier (to keep your workspace private), the business details, products and prices you confirm, your conversations with the assistant, and shop photos that pass moderation.',
      'Optional, only if you separately agree: an encrypted face template used to check that one person is not registering many shops. Camera video is processed in memory and discarded.',
    ],
  },
  {
    heading: 'Why we use it',
    body: [
      'To help you prepare and maintain your business listing, remember your conversation, and keep fraudulent duplicate registrations out. We do not sell your data or use it for advertising.',
    ],
  },
  {
    heading: 'Where it is processed',
    body: [
      'Your records and accepted photos are stored on Google Cloud in Mumbai, India (asia-south1). Text chat and photo reading use Google’s Gemini models in Mumbai. Some processing happens outside India: voice conversations (Google’s live voice models run in the USA), photo safety checks (Google Cloud Vision) and conversation-memory search may be processed by Google in other countries. Google processes this data on our instructions.',
    ],
  },
  {
    heading: 'How long we keep it',
    body: [
      'Until you delete it. "Delete all my data" in the Privacy tab removes your businesses, products, conversations, memory, photos and face data.',
    ],
  },
  {
    heading: 'Your rights',
    body: [
      'You can access, correct and erase your data, withdraw consent at any time (this does not affect processing already done), nominate someone to act for you, and raise a grievance with us and then with the Data Protection Board of India.',
      GRIEVANCE_CONTACT,
    ],
  },
]

export const BIOMETRIC_NOTICE = [
  'This check is optional and never blocks your registration.',
  'We turn a short camera capture into a face template, encrypt it (CKKS homomorphic encryption) and compare it only in encrypted form to spot one person registering many shops.',
  'The video is processed in memory and discarded. A match is never proof that you own a business; it only sends the case for human review.',
  'You can delete your face data at any time from the Privacy tab.',
]
