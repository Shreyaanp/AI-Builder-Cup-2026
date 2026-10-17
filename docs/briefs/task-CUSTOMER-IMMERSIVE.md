# Customer app: immersive, phone-first (owner's original deal)

Owner (17 Oct 14:15): "remember our initial deal: this is supposed to be an immersive experience, phone
first. The customer flow is bad, made just for the sake of it." Stable version by 03:00 tonight.
Branch feat/customer-immersive from release 4 @639fbfe8 (has #78 customer layout); merge release/stable-4
or main in when they move. Ports WEB_PORT=3941 API_PORT=4041. NEVER run commands in the background. No
sub-agents. Plain commits, no AI trailers. Do NOT touch the landing files (Marketing.tsx, landing.css,
v1/Landing.tsx) or owner/onboarding/voice code. The owner tests manually: write unit/component tests and
ONE focused spec; no full suites.

You own the customer flow end to end: first open (front door / Ask home) → ask → results → Browse
everything nearby → shop page → QR scan → stamp card / welcome stamps → passport.

1. Walk it at 390 px and list what makes it feel flat, generic or desktop-ish.
2. Make it feel like a native phone app: full-bleed, one purpose per screen, big imagery of shops/dishes,
   thumb-zone actions, bottom sheets instead of pages where natural, smooth transitions between screens
   (shared-element style shop card → shop page, sheet slide-ups, stamp animation when a stamp lands,
   respecting prefers-reduced-motion), skeletons instead of spinners, no floating buttons over titles
   (fixes #101), clear back behaviour. Use the existing theme tokens (src/design/theme.ts, customer
   audience) and existing components; no duplicate components.
3. Take over PR #94 (fix/browse-page): bring its browse changes into this branch so there is ONE customer
   PR (close #94 with a comment when done).
4. Commit and push every meaningful step; open a draft PR to main early ("Customer app: immersive,
   phone-first"), mark ready when done. Put before/after 390 px screenshots in the PR. Do not merge.
