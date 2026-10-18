# Hindi phone flow QA

## Coverage

Walked the owner app (Coach, Shop, Growth, You) and customer app (Ask, Browse, Rescue, Passport, Chats, Saved, Profile) in offline fixture mode at 390 px and 360 px, touch input, light and dark themes, with Hindi selected. Browser captures: 44. External requests were blocked.

## Bugs fixed

- Customer Browse and Rescue defaulted to a Singapore neighborhood for an Indian phone region. Both now use the configured phone area.
- Hindi copy mixed English interface terms into Hindi sentences: AI, POS/ERP, QR, and a lifecycle note. Updated the existing locale copy and connect label.
- At 360 px, the customer location chip cut off the neighborhood. It now shows the locality while retaining the locality in the accessible label and full area in search.

## Observations

- No browser page errors or console errors were recorded in the 44-screen pass. The page had no horizontal overflow.
- The Growth weather carousel places adjacent slides outside the viewport by design; visible slides were readable and did not overlap.
- Fresh Indian fixtures contained no shops, so populated shop prices and currency formatting could not be checked.
- Vite emitted repeated GSAP target warnings during the browser pass; these were console warnings, not page errors.
- Latin text remaining in Hindi views is limited to brand, provider, and place names such as Google, Open-Meteo, Chalkboard, and Indiranagar, Bengaluru.

## Remaining validation

- Repeat the flow on a physical 360 px and 390 px phone; browser emulation does not validate physical touch targets or device font rendering.
- Add an Indian shop fixture and inspect its prices and currency in Browse and Passport.
- Investigate the Vite GSAP target warnings if they occur in a production build; they did not break the audited flow.
