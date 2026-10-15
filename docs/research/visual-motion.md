# Track A: visual identity and motion (research, 15 Oct 2026)

Decision-ready research for owner decision 4 ("no more black-and-white") and decision 3
("customer side fully gamified with real motion graphics"). No product code was changed.
Mockups: `docs/research/mockups/direction-1.html`, `direction-2.html`, `direction-3.html`
(open in a browser; each has a light/dark toggle and replay buttons). All demo shops named in
mockups are fictional and labelled demo.

---

## 1. Audit: why the current app looks dull

Sources: `src/design/theme.ts`, `src/design/customerTheme.ts`,
`src/design/material-roles.generated.json`, `docs/stories/C-*.png`, `S1-1.png`, `S2-1.png`,
`docs/qa/owner-tamil.png`.

### Root causes in code

| #   | Finding                                   | Evidence                                                                                                   | Effect                                                                                   |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Customer theme is greyscale **by design** | `customerTheme.ts` overwrites every primary/secondary/tertiary role with `#111111` / `#f3f3f3` / `#eeeeee` | All customer colour is removed; the only hue left is the green "open" dot                |
| 2   | Customer images are forced grey           | `'[data-customer] img': { filter: 'grayscale(1)' }`                                                        | Food and shop photos, the most appetising thing we have, are drained                     |
| 3   | Status colours collapsed                  | info/success/warning are set to `palette.primary`                                                          | Success, warnings and rewards look identical; no feedback hierarchy                      |
| 4   | Owner palette is low chroma               | Generated roles: primary `#34694b`, containers `#e9f0e8`, `#e3eae2`, tertiary olive `#556536`              | Everything sits in one muted sage band; cards, chips and page are barely distinguishable |
| 5   | Flat type hierarchy                       | Every display/headline/title role is weight 400; no display face                                           | Headings read like body copy; nothing feels crafted                                      |
| 6   | Motion is two keyframes                   | Only `enterRise` and `fieldFade` exist; global reduced-motion rule                                         | No reward moments, no state change feedback, no personality                              |
| 7   | No illustration system                    | Shop images are grey line-icons (bread, cup) on grey                                                       | Looks like a wireframe; no sense of place                                                |

### Screen-level critique

| Screen                     | What we see                                                                                             | What is wrong                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 Ask home               | Empty white page, light-grey "What are you looking for?", blurred grey blob, 3-tab nav                  | 80% empty; heading looks disabled (low contrast grey); no suggestions, no neighbourhood, no reason to type; input is not even visible above the fold                                    |
| C-8 For you                | Search at top, grey placeholder cards, black check FAB                                                  | Ask bar is in the hardest thumb zone (top); cards are 60% grey placeholder art; "Remembered: Vegetarian" pill is a dead grey slab                                                       |
| C-3 Shop page              | Title, "Following", Directions, 7 identical hours rows, chips, stamp card of 8 empty circles, black CTA | The weekly-hours table owns the fold; the stamp card (the gamified hook) is a bare outline grid with "0 stamps" and "no reward yet"; menu (the thing people want) starts below the fold |
| S1-1 Owner onboarding      | Sage page, green pill, numbered cards with tinted icons                                                 | Competent but generic Material template; "Snap your chalkboard" has no chalkboard in sight                                                                                              |
| S2-1 / owner-tamil My shop | Header, outlined chips stacked vertically, sage cards, sheet                                            | Five outlined secondary actions in a column compete equally; progress ring is the only visual; no morning moment, no data visualisation                                                 |

**Summary:** the product is named Chalkboard, but nothing looks like one. The customer side was
deliberately desaturated, the owner side is a single muted tone, type has no weight contrast, and
there are no reward or feedback animations. Fixing colour roles alone gets ~50% of the way; type,
illustration and motion do the rest.

---

## 2. Three visual directions

All three keep MUI Material 3 roles (drop-in for `material-roles.generated.json` and replace
`customerTheme.ts`). All on-colour pairs below were checked: every `on*` vs its container and
body text vs surface is **≥ 4.5:1** (WCAG AA); most are ≥ 6:1. Script fallbacks follow the
existing lazy loader in `src/i18n/fonts.ts`.

**One colour per feature** (applies to every direction, hues swap per direction):

| Feature                  | D1 Chalkboard   | D2 Sticker Market | D3 Golden Hour |
| ------------------------ | --------------- | ----------------- | -------------- |
| Ask AI                   | Sky             | Ultramarine       | Lilac          |
| Near you / discovery     | Mint            | Lime              | Teal           |
| Passport, stamps, levels | Sunflower       | Sunflower         | Apricot        |
| Rescue deals             | Coral           | Tomato            | Ember (coral)  |
| Owner: radar / demand    | Lilac `#C7B3FF` | Pink              | Lilac          |
| Owner: morning brief     | Sunflower       | Sunflower         | Apricot        |

### Direction 1: "Chalkboard" (lean into the name)

Deep board-green surfaces with chalk-white ink and chalk-pastel accents. Light mode is "kraft
paper with green ink" so the owner app stays bright in daylight shop floors.

| Role                         | Light (kraft paper)                               | Dark (chalkboard)                                 |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| primary / onPrimary          | `#1F5C42` / `#FFFFFF`                             | `#F6C945` sunflower / `#3A2C00`                   |
| primaryContainer / on        | `#B7EBCF` / `#0A3A27`                             | `#5A4500` / `#FFE7A1`                             |
| secondary / onSecondary      | `#7A5900` / `#FFFFFF`                             | `#7FD8B4` mint / `#003828`                        |
| secondaryContainer / on      | `#FFE08A` / `#261A00`                             | `#1F5240` / `#A8F2D2`                             |
| tertiary / onTertiary        | `#B23B2A` / `#FFFFFF`                             | `#FF8A78` coral / `#5C1308`                       |
| tertiaryContainer / on       | `#FFDAD3` / `#3F0A03`                             | `#7E2A1E` / `#FFDAD3`                             |
| sky (custom) / container     | `#00658F` / `#CDE8FF`                             | `#8CCBF5` / `#0F4A6B`                             |
| surface / dim / bright       | `#FBF7EC` / `#DDD5C1` / `#FBF7EC`                 | `#17271F` / `#121F18` / `#2E4337`                 |
| containerLowest → Highest    | `#FFFFFF` `#F5F0E2` `#EFE9D9` `#E9E2D0` `#E2DAC6` | `#0F1A14` `#1C2E25` `#21352A` `#2A4033` `#344B3D` |
| onSurface / onSurfaceVariant | `#1B2A22` / `#4A564D`                             | `#F1EEE3` chalk / `#BFCBBF`                       |
| outline / outlineVariant     | `#7A8478` / `#CBC4B0`                             | `#8A9A8D` / `#3F5547`                             |
| error / errorContainer       | `#BA1A1A` / `#FFDAD6`                             | `#FFB4AB` / `#93000A`                             |

| Aspect       | Spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography   | Body/UI: **Google Sans Flex** (already installed). Display + prices + handwritten notes: **Caveat** (600–700). Price numerals: Google Sans Flex tabular, weight 700. Hand fallbacks: Devanagari **Kalam**, Thai **Mali**, Japanese **Klee One**, Simplified Chinese **Ma Shan Zheng**, Korean **Gaegu**; Tamil/Telugu/Kannada/Bengali have no good Google hand face, so fall back to existing Noto Sans per script (hand style only on Latin/Devanagari/Thai/CJK). Caveat is used for ≤ 10% of text; never for body. |
| Shape        | M3 scale kept; cards 20 px, sheets 28 px; **hand-drawn borders** via a 2 px SVG "wobble" stroke on hero cards only; chips full; stamps irregular circle (SVG).                                                                                                                                                                                                                                                                                                                                                       |
| Iconography  | Lucide (already used) at 2 px stroke with rounded caps, which matches chalk; feature icons sit in a pastel "chalk smudge" blob.                                                                                                                                                                                                                                                                                                                                                                                      |
| Illustration | Chalk-line doodles (SVG stroke, `stroke-linecap: round`, slight jitter filter) for empty states, shop placeholders and badges; a subtle chalk-dust noise texture (2 KB inline SVG `feTurbulence`) on dark surfaces.                                                                                                                                                                                                                                                                                                  |
| Owner app    | Light (kraft) default; green primary, sunflower brief card, lilac radar. Calm, readable on a sunny shop floor.                                                                                                                                                                                                                                                                                                                                                                                                       |
| Customer app | Dark board default (follows system); pastels pop on green; passport is a chalk notebook.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Risk         | Dark green can feel heavy at night if overused: keep containers stepped and cards lighter; never more than three accents per screen.                                                                                                                                                                                                                                                                                                                                                                                 |

### Direction 2: "Sticker Market" (Duolingo × Partiful energy)

Cream paper, saturated sticker colours, chunky tactile buttons (3D bottom edge, Duolingo-style),
die-cut sticker badges with white outline, slightly tilted cards (Partiful posters).

| Role                         | Light                                             | Dark                                              |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| primary / onPrimary          | `#D93A22` tomato / `#FFFFFF`                      | `#FF8E73` / `#4A0B00`                             |
| primaryContainer / on        | `#FFDAD2` / `#3D0600`                             | `#8A2210` / `#FFDAD2`                             |
| secondary / onSecondary      | `#3346E8` ultramarine / `#FFFFFF`                 | `#A9B4FF` / `#0A1470`                             |
| secondaryContainer / on      | `#DEE0FF` / `#000F5C`                             | `#2433B0` / `#DEE0FF`                             |
| tertiary / onTertiary        | `#4C6B00` / `#FFFFFF`                             | `#C6F25A` lime / `#1E2A00`                        |
| tertiaryContainer / on       | `#C6F25A` / `#1E2A00`                             | `#3A5200` / `#DFFFA0`                             |
| sunflower / pink (custom)    | `#FFC933` / `#FFB3D6` (on `#3E0022`)              | `#FFD966` / `#FF8CC6`                             |
| surface / dim / bright       | `#FFF8EF` / `#E8DCCB` / `#FFFFFF`                 | `#16141B` / `#110F15` / `#3A3640`                 |
| containerLowest → Highest    | `#FFFFFF` `#FFF2E3` `#FBEBD8` `#F5E3CD` `#EFDAC2` | `#0E0C12` `#1E1B24` `#24212B` `#2E2A36` `#393441` |
| onSurface / onSurfaceVariant | `#1A1714` / `#51483F`                             | `#F7F1EA` / `#CFC5BA`                             |
| outline / outlineVariant     | `#1A1714` (2 px ink outlines) / `#D6C8B6`         | `#F7F1EA` / `#4A4452`                             |

| Aspect       | Spec                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography   | Display: **Bricolage Grotesque** (variable, 700–800, condensed width for big numbers). Body: Google Sans Flex. Rounded script family for parity: **Baloo 2** (Devanagari), **Baloo Da 2** (Bengali), **Baloo Thambi 2** (Tamil), **Baloo Tammudu 2** (Telugu), **Baloo Tamma 2** (Kannada), **Mitr** (Thai), **M PLUS Rounded 1c** (Japanese), **Jua** (Korean), **ZCOOL KuaiLe** (Chinese display). |
| Shape        | Large radii (24 px cards, full buttons), 2 px ink outline + 4 px hard offset shadow ("neo-brutal soft"); stickers die-cut with 3 px white stroke and ±4° tilt.                                                                                                                                                                                                                                       |
| Iconography  | Lucide filled-duotone variant (stroke + 30% tint fill); feature icons as stickers.                                                                                                                                                                                                                                                                                                                   |
| Illustration | Flat cut-paper food stickers (emoji-grade simplicity), tape and stamp marks.                                                                                                                                                                                                                                                                                                                         |
| Owner app    | Same palette but tilt off, shadows lighter, density higher: playful brand, serious tools.                                                                                                                                                                                                                                                                                                            |
| Customer app | Full sticker energy: bouncy springs, confetti, tilted cards, chunky press states.                                                                                                                                                                                                                                                                                                                    |
| Risk         | Can read "kids app" and loud next to food photos; outlines add visual noise at high density.                                                                                                                                                                                                                                                                                                         |

### Direction 3: "Golden Hour" (Airbnb 2025 warmth × Pokémon GO map moments × Arc gradients)

The neighbourhood at dusk: indigo night surfaces, apricot lantern light, glowing map pins.
Dimensional, softly lit icons (in the spirit of Airbnb's 2025 3D icon refresh), a glanceable map
as the hero, gradients only for light sources, never as wallpaper.

| Role                         | Light (daylight)                                  | Dark (dusk, default for customer)                                     |
| ---------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| primary / onPrimary          | `#9A4600` / `#FFFFFF`                             | `#FFB870` apricot / `#3D1E00`                                         |
| primaryContainer / on        | `#FFDCBE` / `#331200`                             | `#6E3A00` / `#FFDCBE`                                                 |
| secondary / onSecondary      | `#006A5E` / `#FFFFFF`                             | `#5FE0CC` teal / `#00382F`                                            |
| secondaryContainer / on      | `#9EF2E2` / `#00201B`                             | `#00504A` / `#9EF2E2`                                                 |
| tertiary / onTertiary        | `#6A4FB6` / `#FFFFFF`                             | `#CDB4FF` lilac / `#2A1060`                                           |
| tertiaryContainer / on       | `#E8DDFF` / `#22005D`                             | `#51389C` / `#E8DDFF`                                                 |
| ember (rescue)               | `#B3261E` / container `#FFDAD6`                   | `#FF8A80` / container `#7A1A14`                                       |
| surface / dim / bright       | `#FFF7F0` / `#E6D7CB` / `#FFFFFF`                 | `#14112A` / `#0E0C1F` / `#3A3558`                                     |
| containerLowest → Highest    | `#FFFFFF` `#FFF0E4` `#FAE8DA` `#F4E1D2` `#EEDACA` | `#0B0920` `#1B1734` `#211D3C` `#2B2648` `#363054`                     |
| onSurface / onSurfaceVariant | `#22192B` / `#544A5E`                             | `#F4EEFF` / `#CAC2DA`                                                 |
| outline / outlineVariant     | `#857A8F` / `#D8CEDD`                             | `#948BA6` / `#463F5E`                                                 |
| Signature gradient           | `#FFDCBE → #FFB3C7` (cards only)                  | `#FFB870 → #FF7A9A → #7A5CFF` (light sources: pins, rings, hero glow) |

| Aspect       | Spec                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography   | Display: **Fraunces** (soft optical serif, 600, SOFT 100). Body: Google Sans Flex. Serif fallbacks: **Noto Serif Devanagari / Tamil / Telugu / Kannada / Bengali / Thai / JP / SC / KR**; body stays Noto Sans per script. |
| Shape        | Soft: 24 px cards, 32 px sheets, glass panels (`backdrop-filter: blur(16px)`, 70% surface) over the map only.                                                                                                              |
| Iconography  | Lucide for UI; feature hero icons are small dimensional "clay" renders (pre-rendered WebP, 96 px, 4–8 KB each).                                                                                                            |
| Illustration | Dusk neighbourhood map (stylised vector tiles), glowing pins, soft volumetric light.                                                                                                                                       |
| Owner app    | Daylight light theme; apricot brief, teal stock, lilac radar; map shows where demand comes from.                                                                                                                           |
| Customer app | Dusk dark default; map-first Ask home; rescue pins pulse as closing time approaches.                                                                                                                                       |
| Risk         | Map-first needs a map renderer (free tiles/terms) and more build time; glass and glow cost GPU on low-end Android; 3D icons need asset production.                                                                         |

---

## 3. Motion language

### Tool evaluation

| Tool                                                                   | Licence                                                                                                                                                                          | Size (approx., gzip)                                                              | Fit for Chalkboard                                                                                                     | Verdict                                                                                                                                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS keyframes / transitions + Web Animations API                       | n/a                                                                                                                                                                              | 0 KB                                                                              | Pulses, entrances, chalk stroke draws (`stroke-dashoffset`), press states                                              | **Default** for 70% of motion                                                                                                                                                |
| MUI transitions (`Grow`, `Fade`, `Collapse`)                           | MIT                                                                                                                                                                              | already bundled                                                                   | Sheets, dialogs, list changes                                                                                          | Use as is, retune easings                                                                                                                                                    |
| **GSAP 3** (`gsap` on npm)                                             | Standard "No Charge" licence (Webflow, 30 Apr 2025): free incl. SplitText, DrawSVG, MorphSVG, Physics2D, commercial OK; only bans building a competing no-code animation builder | core ~25–30 KB; each plugin 3–10 KB                                               | Multi-step timelines: stamp thud + dust, badge unlock, level-up, passport flip; `gsap.matchMedia()` for reduced motion | **Use**, lazy-load on customer gamified routes only                                                                                                                          |
| Motion (motion.dev, ex-Framer Motion)                                  | MIT                                                                                                                                                                              | `animate` mini ~2.5 KB; React `motion` component ~30 KB                           | Drag/swipe springs (morning brief deck)                                                                                | Optional; GSAP Draggable or plain pointer events also fine. Pick one, not both                                                                                               |
| Lottie (`lottie-web` light) / dotLottie (`@lottiefiles/dotlottie-web`) | MIT runtime; free LottieFiles assets under the Lottie Simple License (free commercial use, no attribution)                                                                       | lottie light ~60 KB; dotLottie uses a WASM renderer (several hundred KB, lazy)    | Designer-made loops: streak flame, confetti                                                                            | **Maybe**, only for 1–2 assets, lazy; check each asset's licence page                                                                                                        |
| Rive (`@rive-app/canvas-lite`)                                         | MIT runtime; editor is a paid SaaS for exports beyond free tier                                                                                                                  | canvas-lite ~222 KB brotli; full canvas ~567 KB (Rive runtime-size doc, Jan 2026) | Interactive state machines (mascot)                                                                                    | **Skip**: authoring time and size not justified in 3 days                                                                                                                    |
| three.js                                                               | MIT                                                                                                                                                                              | ~150 KB+ core                                                                     | 3D passport cover, neighbourhood diorama                                                                               | **Skip in product**; acceptable for a single lazy "passport cover" moment or demo video only                                                                                 |
| **HyperFrames** (HeyGen, github.com/heygen-com/hyperframes)            | Apache-2.0                                                                                                                                                                       | n/a (build-time; Node ≥ 22 + FFmpeg, headless Chrome)                             | Writes video as HTML/CSS compositions, renders deterministic MP4; ships agent skills for Claude Code/Codex             | **Demo video only.** Great fit: our mockup HTML/CSS animations can be reused as video scenes. Not an in-app runtime                                                          |
| **OpenMontage** (github.com/calesthio/OpenMontage)                     | **AGPL-3.0**                                                                                                                                                                     | n/a                                                                               | Agentic video production pipeline (script, assets, edit, render) driven by a coding agent                              | **Demo video only**, run as a separate tool; never import its code into the app (AGPL). Useful for B-roll/assembly; HyperFrames is the better primary for UI-accurate scenes |

**Bundling rule:** every library comes from npm and is bundled by Vite; no runtime CDN. GSAP and
any Lottie player load via dynamic `import()` on the passport/rescue/shop routes so the owner
app and first paint pay nothing.

**Reduced motion (important bug risk):** the current global rule
(`animation: none !important; transition: none !important`) does **not** stop GSAP, Motion or
Lottie, which animate inline styles or canvases. Every JS animation must be wrapped in
`gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', …)` (or check
`matchMedia` before calling), and reduced mode must still show the _end state_ plus a
non-motion cue (colour change, check icon, short text "Stamp added").

### Signature animations

Durations assume 60 fps; easings reference `motion.easing` in `theme.ts` plus two new tokens:
`overshoot: cubic-bezier(0.34, 1.56, 0.64, 1)` and `thud: cubic-bezier(0.7, 0, 0.84, 0)` (fast in).

| #   | Name                                       | Trigger                                                            | Choreography                                                                                                                                         | Duration / easing                                                        | Implementation                                           | Reduced motion                             |
| --- | ------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------ |
| 1   | **Chalk redraw**                           | Price or stock changes (owner save, customer view of updated item) | Old price gets a chalk strike-through (SVG path draw), new price writes in left-to-right via clip-path, small dust puff                              | strike 250 ms + write 450 ms, `emphasizedDecelerate`                     | CSS (`stroke-dashoffset` + `clip-path` keyframes)        | Instant swap + "Updated" chip              |
| 2   | **Stamp thud + chalk dust**                | Stamp earned (QR, rescue, tip)                                     | Stamp drops from 1.8× with −12° rotation, lands at 0.92 → 1, card shakes 2 px, 10–14 dust particles burst radially and fade; `navigator.vibrate(12)` | 420 ms total; drop 180 ms `thud`, settle 240 ms `overshoot`; dust 600 ms | GSAP timeline (dust via `Physics2D` or manual), lazy     | Stamp appears filled, counter text updates |
| 3   | **AI sketching** (thinking state)          | Ask submitted, waiting on Gemini                                   | A chalk squiggle draws and erases under the query; three chalk dots trace a loop; caption cycles "Checking 14 shops near you…"                       | loop 1.4 s, `standard`; caption every 1.2 s                              | CSS (SVG dash animation)                                 | Static dots + caption text                 |
| 4   | **Badge unlock**                           | Quest completed / level badge earned                               | Bottom sheet rises, badge flips from back (rotateY 180°), light sweep across, chalk confetti in feature colour, title types in                       | 1.1 s; flip 500 ms `emphasizedDecelerate`, sweep 600 ms                  | GSAP timeline + CSS 3D                                   | Sheet appears with badge face up           |
| 5   | **Rescue countdown pulse**                 | Rescue deal live (< 60 min to close)                               | Ring pulses outward from pin/card; pulse speeds 2.0 s → 0.8 s in the last 10 min; digits roll (tabular nums)                                         | loop, `ease-out`                                                         | CSS keyframes + JS sets `--pulse-dur`                    | Static ring, digits update each minute     |
| 6   | **Passport page turn**                     | Swiping between neighbourhood pages                                | Page rotates on left edge (rotateY −160°) with shading gradient; next page stamps fade in staggered 40 ms                                            | 650 ms `emphasized`                                                      | CSS 3D (`perspective: 1200px`); GSAP if scrubbed by drag | Crossfade 0 ms                             |
| 7   | **Level-up**                               | XP crosses threshold (Newcomer → Regular → Local Hero)             | XP bar fills, overflows with glow, level number odometer-rolls, title chalk-writes, short burst                                                      | 1.4 s; bar 600 ms, roll 400 ms `overshoot`                               | GSAP (SplitText for title)                               | Text "You are now a Regular"               |
| 8   | **Quest tick**                             | Quest step done                                                    | Hand-drawn check draws in the box, row highlights in feature colour, progress pip fills                                                              | 300 ms `emphasizedDecelerate`                                            | CSS stroke draw                                          | Check appears                              |
| 9   | **Follow spark**                           | Follow a shop                                                      | Heart/bookmark pops 1 → 1.25 → 1, four chalk sparks fly out                                                                                          | 380 ms `overshoot`                                                       | CSS                                                      | Icon fills                                 |
| 10  | **Curated reveal** ("Near you · 3 finds")  | Ask home load                                                      | Cards deal in like cards on a table: translateY 24 → 0, rotate ±3° → 0, stagger 70 ms; max 3 cards                                                   | 450 ms each `emphasizedDecelerate`                                       | CSS `animation-delay` (no lib)                           | Cards visible immediately                  |
| 11  | **Streak flame**                           | Weekly streak kept                                                 | Flame flickers once, number increments                                                                                                               | 800 ms                                                                   | CSS (or one free Lottie asset, lazy)                     | Static flame                               |
| 12  | **Radar sweep** (owner unmet demand)       | Radar card visible                                                 | Conic sweep rotates; demand blips pop in with scale overshoot as sweep passes                                                                        | 3 s loop; blips 250 ms                                                   | CSS `conic-gradient` + rotate                            | Static blips                               |
| 13  | **Brief deck swipe** (owner morning brief) | Drag card                                                          | Card follows finger with rotation ∝ dx; release flings off with spring, next card scales 0.96 → 1                                                    | spring (stiffness 300, damping 30)                                       | Pointer events + WAAPI (or Motion if adopted)            | Buttons "Next" without motion              |
| 14  | **Impact count-up**                        | Rescue confirmed                                                   | "You saved 12 meals" number counts up, leaf/plate icon bounces                                                                                       | 700 ms `emphasizedDecelerate`                                            | WAAPI / rAF                                              | Final number                               |
| 15  | **Pin drop** (map, D3)                     | Map loads or new deal                                              | Pins drop with squash-and-stretch, shadow scales                                                                                                     | 400 ms `overshoot`, stagger 50 ms                                        | CSS                                                      | Pins static                                |

Motion budget: ≤ 1 reward animation on screen at once; reward animations ≤ 1.5 s and never block
input (they play while the UI is already usable); only `transform`/`opacity`/`clip-path`/
`stroke-dashoffset` animate.

---

## 4. Open-source sources we can copy from

| Source                                                    | What to take                                                  | Licence                                                                | Notes                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Magic UI (magicui.design)                                 | Number ticker, confetti, shine border, animated list, marquee | MIT                                                                    | Tailwind + Motion based; port the idea to MUI `sx`/CSS (we do not use Tailwind)                                     |
| motion-primitives (ibelick)                               | Text effect, animated number, tilt, spinning text             | MIT                                                                    | Depends on Motion; small, readable                                                                                  |
| React Bits (reactbits.dev, DavidHDev)                     | Count-up, splash cursor ideas, stagger text, "click spark"    | MIT + Commons Clause                                                   | Free in commercial products; Commons Clause only forbids selling the components themselves. Keep the licence header |
| Aceternity UI (free tier)                                 | Card hover effects, background beams (inspiration)            | Free tier terms not clearly published; Pro licence bans redistribution | **Inspiration only**; re-implement rather than copy                                                                 |
| GSAP demos (gsap.com/demos, CodePen GreenSock collection) | Stamp/flip/stagger timelines                                  | GSAP Standard licence                                                  | Copy freely within GSAP licence terms                                                                               |
| LottieFiles free animations                               | Flame, confetti, check                                        | Lottie Simple License (free, commercial, no attribution)               | Verify per asset; prefer `.lottie` format; ≤ 30 KB each                                                             |
| Material Symbols / Lucide                                 | Icons                                                         | Apache-2.0 / ISC                                                       | Lucide already in deps                                                                                              |
| Google Fonts listed above                                 | All type                                                      | SIL OFL 1.1                                                            | Self-host via `@fontsource/*` (npm), not Google CDN, matching current setup                                         |
| Rough.js (optional)                                       | Hand-drawn card borders/underlines (D1)                       | MIT                                                                    | ~9 KB; or hand-author 4–5 static SVG wobble paths (0 KB)                                                            |

---

## 5. UX heat-map guidance (390 × 844)

| Zone (y range) | Thumb reach (right-handed, one hand)                | Put here                                                                                                           | Never put here                                                      |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Top 0–180      | Hard (stretch / two hands)                          | Glanceable status: location, level/XP bar, demo label, countdown text                                              | Primary actions, Ask input (today's C-8 places the Ask bar here)    |
| Middle 180–560 | OK, scanning zone (eyes land here first, F-pattern) | Curated "Near you" cards (max 3), passport page, menu with prices, reward _display_ (badge sheet peeks from below) | Dense tables (weekly hours: collapse to "Open now · until 18:00 ▸") |
| Bottom 560–780 | Easy (natural thumb arc)                            | **Ask bar** (pinned above nav), Chat with shop, Stamp/claim button, owner "Yes, menu's the same", rescue one-tap   | Destructive actions without confirm                                 |
| Nav 780–844    | Easy                                                | 4 tabs max: Ask · Near you · Passport · Chats (customer); Coach · My shop · Radar · Settings (owner)               | Settings icon in top-right as the only route (today's owner header) |

Rules:

1. One primary action per screen, bottom zone, filled in the feature colour.
2. Rewards (stamp, badge, level-up) animate in the middle zone, then settle into a chip near the
   bottom action that caused them, so the eye follows cause → effect.
3. Prices and "open now" status are the most-scanned items: give them display weight and colour.
4. Swipe gestures (brief deck, passport pages) always have a visible button equivalent.
5. Desktop (≥ 840 px): two-pane layout; reward sheets become centred dialogs; nav becomes a rail.

---

## 6. Recommendation

**Choose Direction 1, "Chalkboard", with two borrowings from Direction 2.**

| Reason                     | Detail                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand fit                  | The product is literally named after the merchant's chalkboard; the look explains the product (owners snap their board, customers see it come alive). No competitor owns this look. |
| Owner + customer coherence | Kraft-paper light mode for owners in daylight, chalkboard dark for customers in the evening: one system, two moods.                                                                 |
| Motion is native to it     | Chalk redraws, stamps, dust and sketching are physically believable metaphors, not decoration; they double as the demo video's signature shots.                                     |
| Cost                       | Pure palette + two Google fonts + SVG strokes; most motion is CSS; GSAP lazy for 4 reward moments. Fits the 16–17 Oct build.                                                        |
| Accessibility              | All role pairs ≥ 4.5:1; pastel-on-green reads at 6–10:1.                                                                                                                            |

Borrow from D2: **chunky press state** (2–3 px bottom edge on primary buttons and stamp button)
and **die-cut sticker badges** in the passport, for tactility. Borrow from D3 later if time
allows: the **pulsing rescue map pins** (motion #5, #15) inside the Chalkboard palette.

Implementation sketch (for whoever builds the theme): replace `material-roles.generated.json`
values with the D1 tables (or seed MCU with `#1F5C42` and override accents by hand); delete the
greyscale overrides and `grayscale(1)` filter in `customerTheme.ts` and make it switch the
customer default to dark board; add `@fontsource/caveat` + `@fontsource/kalam` (lazy for hi/mr);
raise headline weights to 600 (display 700); add `overshoot`/`thud` easing tokens; add a
`featureColor` map (`ask`, `near`, `passport`, `rescue`, `radar`, `brief`); add `gsap` and gate it
with `gsap.matchMedia()`.

Sources: [GSAP standard licence](https://gsap.com/community/standard-license/),
[Webflow: GSAP becomes free](https://webflow.com/blog/gsap-becomes-free),
[HyperFrames](https://github.com/heygen-com/hyperframes),
[OpenMontage](https://github.com/calesthio/OpenMontage),
[Rive runtime sizes](https://rive.app/docs/runtimes/runtime-sizes.md),
[Aceternity licence](https://ui.aceternity.com/licence), React Bits licence (upstream repo
DavidHDev/react-bits, MIT + Commons Clause). Sizes marked "approx." should be re-measured with
`vite build` when adopted.
