# Research B: customer gamification and neighbourhood discovery

Track B of `docs/PLAN-V2.md`, written 15 Oct 2026 for submission on 18 Oct. This is research only:
no product code was changed. Every number marked _(proposal)_ is a design choice for the owner to
confirm. Anything marked _(verify)_ is outside data that was not checked against a primary source.

**The short version.** The customer app should open on **Today**: a finite, hand-picked set of
7 neighbourhood finds that changes every morning, with Ask docked at the bottom. A **weekly**
passport (stamps from real visits, quests, three levels, perks the owner funds) gives people a
reason to come back, and **closing-time rescue** gives them a reason to come back _now_. A cached
Gemini "area pack" fills the neighbourhood with believable, clearly labelled demo shops. It only
fills the gaps between real shops and never puts words in a real business's mouth.

---

## 0. What exists today (baseline)

| Area               | What is there now                                                                                                                                                                              | Gap against the brief                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Home (`/explore/`) | `AskHome.tsx`: an Ask box, location picker, and result groups `for_you · best · open · more`                                                                                                   | An empty box until you type. Nothing surprising, no motion story, no reason to open it tomorrow                                   |
| Nav                | `CustomerNav.tsx`: Ask · Chats · Saved                                                                                                                                                         | No home for the passport or rescue                                                                                                |
| Rewards            | `rewards/storage.ts`: per-shop stamp card in `localStorage`; a `?source=qr` visit adds 1 stamp per shop per local day; celebrations at stamps 5 and 10; a 3-day `streak` flag; an `early` flag | Client-only, so it can be spoofed. No cross-shop passport, points, levels or quests. The ID regex only allows `uuid` and `demo-*` |
| Community          | `community.py`: profiles, follows, update feed (price drop, back in stock, new item), tips (moderated, 1 per customer per shop), seeded `Demo update` and `Demo tip`                           | Good raw material for feed cards. Nothing is ranked as a "find" yet                                                               |
| Discover           | `discover_ask.py`: Gemini intent → our shops within a radius + Places `searchText`/`searchNearby`; `MapsService.demo` returns `FIXTURE_PLACES`                                                 | Answers questions but never offers anything unprompted                                                                            |
| Demo data          | `demo_data.py` + `demo_catalogue.py`: fixed shops in Singapore plus 8 APAC neighbourhoods (Bengaluru, Delhi, Mumbai, KL, Jakarta, Tokyo, Bangkok…), placed on a grid and labelled demo         | Static and city-bound. Open the app anywhere else and it is empty                                                                 |

---

## 1. What drives retention in consumer apps (2024–2026)

### 1.1 Mechanic by mechanic

| App                       | Mechanic                                                                                                                 | Why it works                                                                                                                                     | Pitfall seen                                                                                                                                        | Steal for Chalkboard?                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Duolingo                  | Daily streak, streak freeze, streak-saver notification, weekly leagues (cohorts of about 30, promotion and demotion), XP | Loss aversion plus a visible identity number. Leagues make the competition small and winnable. Freezes stop one missed day from ending the habit | Streak anxiety and guilt pushes (the "sad owl" meme). Duolingo says its retention analysis was correlational. People quit once a long streak breaks | **Yes, but weekly.** Small opt-in area leagues. An auto-earned "rain check" freeze. No guilt copy  |
| Pokémon GO (Niantic)      | Location-bound content, Field Research, a 7-day "research breakthrough", Community Days, seasonal events                 | The real world becomes the game board. Time-boxed events give a reason to go out on a given day                                                  | Trespass and safety incidents. Spoofing (which led to strikes and bans). Event fatigue                                                              | **Yes:** seasonal trails, a weekly breakthrough, public places only, location checks               |
| Too Good To Go            | Surprise bags at closing time, pickup windows, a personal impact counter ("meals saved, CO2e avoided")                   | Real scarcity, a good deed and a bargain all at once. The impact counter is a positive identity                                                  | Disappointing bags. "Sold out in seconds" frustration. Impact numbers are estimates                                                                 | **Yes:** closing-time rescue, a pickup window, an impact meter shown as an estimate                |
| Strava                    | Segments, Local Legend (most efforts on a segment in 90 days), kudos, monthly challenges, privacy zones                  | Local Legend rewards **showing up**, not being fastest, so anyone can win it. Kudos are a cheap social reward                                    | Heatmap and route leaks of sensitive sites (2018). Leaderboard cheating                                                                             | **Yes:** a "Regular of the month" per shop that counts visits, not spend. Privacy zones by default |
| Swarm / Foursquare        | Check-ins, stickers, mayorships, coins                                                                                   | Collecting plus a status title tied to one real place. Stickers reward variety                                                                   | Splitting discovery and check-in into two apps (2014) lost much of the community. Check-in spam                                                     | **Yes:** stamps are stickers in a passport, and discovery and passport stay in **one** app         |
| Snapchat Snap Map         | Live friend map, heat "stories" by place                                                                                 | "What's happening right now near me"                                                                                                             | 2017 privacy backlash, which led to Ghost Mode. Live location of minors                                                                             | **Only in aggregate:** "busy now" at shop level, never people's locations                          |
| Starbucks Rewards         | Stars, personalised challenges ("buy 3 afternoon drinks this week"), Double Star Days, tiers                             | Challenges target **this** user's gaps. Rewards tie straight to the product                                                                      | Devaluations angered members (2019 and 2023 star changes). Spend-based tiers exclude light users                                                    | **Yes:** personalised weekly quests. Perks never lose value once earned                            |
| Zomato / Swiggy           | Gold and One memberships, spinning-wheel and cricket-season games, Zomaland events, playful push copy                    | Witty copy and cultural moments (IPL, festivals) feel local                                                                                      | Promo-driven loyalty fades when discounts stop. Discount wars hurt restaurants                                                                      | **Copy tone and festival hooks.** No platform-funded discounts                                     |
| Grab                      | GrabRewards points across services, tiers Member → Silver → Gold → Platinum, a challenge feed                            | One wallet for everything. A visible "next tier"                                                                                                 | Tier downgrades and confusing point values                                                                                                          | **Show the next level and a progress ring.** Levels never go down                                  |
| Xiaohongshu (RED)         | Discovery notes from real people, "种草" (seeding desire), saved collections, search-as-discovery                        | People search for trusted local finds instead of ads. Collections are lasting value                                                              | Fake and paid notes. Over-filtered photos                                                                                                           | **Yes:** tips as short notes, saves into collections. Every demo note is labelled                  |
| Google Maps Local Guides  | Points for reviews, photos and edits; levels 1–10; a badge from level 4                                                  | Mastery plus helping others. Small perks                                                                                                         | Points-for-content leads to low-quality or fake reviews. Perks shrank over time                                                                     | **Points for tips only after moderation**, and capped. Tips marked helpful earn the most           |
| Japan eki / "stamp rally" | Physical stamp stations at stations, shops and events; goshuin books                                                     | A tactile collection that rewards visiting places (a culture already familiar across APAC)                                                       | Low tech, so it's hard to measure                                                                                                                   | **The visual metaphor for the passport:** inked stamps, smudge, a date line                        |

Sources are at the end. The specific outside figures used here: Duolingo found that users with a
10-day streak dropped off less (correlational, by its own account), and TGTG's estimate of
**2.7 kg CO2e per meal saved** (its 2024 Blonk life-cycle study, assuming 1 kg per bag).

### 1.2 Principles drawn from the table

| #   | Principle                                         | Rule for Chalkboard                                                                                                                              |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | **Finite beats infinite**                         | Today shows 7 finds, then "That's today's 7. New finds at 7 am." Wordle and BeReal show a daily drop pulls people back without endless scrolling |
| P2  | **Weekly cadence for local life**                 | People don't visit a bakery every day. A streak counts **weeks** with at least 1 verified visit, so missing a day costs nothing                  |
| P3  | **Reward showing up, not spending**               | Points never come from money (we have no checkout anyway). "Regular" counts visits on different days                                             |
| P4  | **Real-world proof**                              | Stamps need the shop's QR **plus** the phone's location **plus** once per shop per day. Anything else earns no points                            |
| P5  | **Owners fund perks, Chalkboard funds glory**     | Badges, titles and motion are free. Real perks are chosen by the owner and claimed in chat or at the counter                                     |
| P6  | **Real urgency only**                             | Countdowns exist only when an owner set an end time. No fake "3 people looking". Demo countdowns are labelled demo                               |
| P7  | **Never other people's locations**                | No friend map. "Busy now" is per shop, aggregated and delayed. Leaderboards are opt-in and show a display name and level only                    |
| P8  | **Positive identity, no guilt**                   | "You've rescued 12 meals" and never "Don't let your streak die". One reminder a week at most, and it can be switched off                         |
| P9  | **Celebrate the moment, then get out of the way** | One big moment per action (a stamp thud, a level-up), 1.2 s at most, skippable, off under reduced motion                                         |

### 1.3 Dark patterns we will not use

| Pattern                              | Seen in                    | Our alternative                                                                                 |
| ------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------- |
| Guilt or shame notifications         | Streak apps                | One upbeat weekly digest, opt-in                                                                |
| Fake scarcity or social proof        | Booking-style sites        | Only countdowns and portion counts the owner set                                                |
| Loot boxes and random paid rewards   | Games                      | Rewards you can see ahead of time. The surprise lives in _discovery_                            |
| Points that expire or lose value     | Airline and coffee loyalty | Points never expire. Perks are honoured as shown when they were earned                          |
| Live location sharing                | Snap Map                   | None. Area-level only                                                                           |
| Paying for reviews with points       | Local Guides               | Tip points need moderation, are capped, and grow when marked helpful                            |
| Hard paywall or dark-pattern sign-in | Many                       | Browse, Ask, Today and the rescue map stay anonymous. Sign-in only for chat and the leaderboard |

---

## 2. The core loop and its systems

### 2.1 The loop

```
 Ask / Today's 7  ──►  discover a find  ──►  visit (QR stamp) or rescue (hold in chat, collect)
        ▲                                                  │
        │                                                  ▼
  return: new 7 at 7 am · rescue push · quest progress ◄── earn: stamp + points + quest step + impact
```

| Step     | Trigger                                    | Action                                               | Reward (variable, but visible ahead of time) | What brings them back                        |
| -------- | ------------------------------------------ | ---------------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Discover | Open the app, a 7 am drop, Ask             | Swipe Today's 7, or ask                              | Surprise ("I never knew…")                   | Tomorrow's 7, Saved                          |
| Visit    | A find, a quest step                       | Scan the shop QR with the phone camera               | Stamp thud, points, quest tick               | Shop card progress, the next quest step      |
| Rescue   | A followed shop posts a rescue, map pulses | "Hold one for me" sends a chat message, then collect | Impact meter rises, rescue stamp             | The impact milestone, the shop's next rescue |
| Earn     | Any verified action                        | none                                                 | Level ring fills, badge, perk unlocked       | Next level, weekly streak                    |
| Return   | 7 am drop, weekly digest, festival trail   | Open                                                 | New content, every time                      | none                                         |

### 2.2 Neighbourhood passport

**Areas.** An area is a named neighbourhood: reverse-geocoded `suburb`/`neighbourhood` from
Nominatim or Places, with the 5-character geohash (about 4.9 × 4.9 km) as the fallback key. Each
area has its own page, which is the passport's "country page".

| Area page block | Content                                                                                        | Source                          |
| --------------- | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| Header          | Area name, a one-line hook ("Art Deco flats and the city's oldest bakeries"), your stamps here | Wikipedia geosearch + generator |
| Stamp grid      | Up to 12 shops in the area as empty or inked stamp slots (empty slots show as chalk outlines)  | Our DB, then generated shops    |
| Area quests     | 1–3 active quests                                                                              | Quest engine                    |
| Regulars board  | Opt-in top 10 this week, plus "you are #14"                                                    | Server                          |
| Area facts      | 2–3 facts with sources ("Built 1936 · Wikipedia")                                              | Wikipedia, OSM                  |

**Stamp sources and points** _(proposal)_

| Action                                | Proof required                                                                                                     | Stamp                  | Points                        | Limits                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----------------------------- | -------------------------------------------------- |
| Visit (QR)                            | Shop QR with a signed token **and** location within 150 m (accuracy ≤ 100 m) **and** a new local day for this shop | Shop stamp (inked)     | 20                            | 1 per shop per local day. 6 shops per day overall  |
| First try (first verified visit ever) | As above                                                                                                           | Gold-rim "first" stamp | +30 bonus                     | Once per shop, ever                                |
| Rescue collected                      | Owner taps "Collected" in chat **or** a rescue QR at pickup                                                        | Leaf stamp             | 40                            | 2 per day                                          |
| Helpful tip                           | Tip passes moderation                                                                                              | Pencil stamp           | 10                            | 1 per shop (as now). 3 tips per day earn points    |
| Tip marked helpful by a neighbour     | Another signed-in customer, not the author                                                                         | none                   | +5 each                       | Up to 25 per tip                                   |
| Quest step                            | The step's own proof (usually a visit)                                                                             | none                   | none (counted in the visit)   | none                                               |
| Quest complete                        | All steps done within the window                                                                                   | Quest badge            | 100 (trail) or 250 (festival) | none                                               |
| Weekly streak milestone               | 4, 8, 12, 26 weeks                                                                                                 | Streak badge           | 50 / 100 / 150 / 300          | none                                               |
| Ask, follow, open the app, share      | none                                                                                                               | none                   | **0**                         | Passive actions earn nothing, so nobody farms them |

**Anti-abuse.**

| Threat                         | Defence                                                                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photo of the QR shared online  | The QR encodes `shop_id` + a key version. The stamp endpoint also needs a location fix inside the shop radius. Outside the radius, the visit is logged with no stamp and the copy says "Stamps need you at the shop" |
| GPS spoofing                   | Reject accuracy > 100 m and speed > 150 km/h between stamps. Flag more than 3 rejected stamps a day. Leaderboard only for signed-in users with clean history                                                         |
| Repeat scans                   | Once per shop per **local day** (keeps today's `lastStamp` rule). A cap of 6 stamps per day                                                                                                                          |
| Owner self-stamping or friends | An owner's own account earns no points at their shop. Perks the owner funds are their own risk anyway                                                                                                                |
| Local storage tampering        | The server is the source of truth for signed-in users. Signed-out stamps stay "on this phone", don't count for the leaderboard, and merge once on sign-in (re-checked)                                               |
| Location refused               | The QR still adds a **shop card** stamp (as today), but no passport points. The copy explains why                                                                                                                    |
| Demo shops                     | Demo QRs (shown on screen in the demo) produce **demo stamps** with points labelled "demo points", kept apart from real points                                                                                       |

**Levels** _(proposal: they never go down)_

| Level          | Threshold                                                                             | Unlocks                                                                               | Copy                                                             |
| -------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Newcomer**   | 0                                                                                     | Passport, Today's 7, the rescue map                                                   | "Welcome to Tiong Bahru. 12 stamps to find."                     |
| **Regular**    | 300 pts **and** 5 different shops **and** 2 visits to the same shop on different days | A Regular badge on tips, "Regular" perks from owners, the leaderboard                 | "You're a Regular now. Shops can see you keep coming back."      |
| **Local Hero** | 1,200 pts **and** 15 shops **and** 2 areas **and** 5 rescues or 3 helpful tips        | A Hero frame, early access to rescues (5 min before followers), a vote on area quests | "Local Hero. Your neighbourhood is better because you're in it." |

Progress always shows as the **next single requirement** ("2 more shops to Regular"), never as a
wall of numbers.

**Weekly streak.** A week (Monday to Sunday, local time) counts if it has at least 1 verified
stamp or rescue. One **rain check** is earned automatically every 4 streak weeks (maximum 1 held)
and is used up silently on a missed week. Copy: "Streak: 6 weeks · 1 rain check saved". Missing a
week with no rain check left: "New streak starts with your next visit." There is no loss
animation.

**Quests** _(proposal)_

| Quest type                 | Example                                               | Steps                       | Window                   | Reward                                                            |
| -------------------------- | ----------------------------------------------------- | --------------------------- | ------------------------ | ----------------------------------------------------------------- |
| Crawl                      | "Breakfast crawl: kopi, kaya, a bun before 10 am"     | 3 visits, each before 10:00 | 7 days                   | 100 pts + badge                                                   |
| Category                   | "Five tailors and fixers: the repair trail"           | 5 different shops           | 30 days                  | 100 pts                                                           |
| Personal (Starbucks-style) | "You've never tried the east side: 2 shops in Katong" | 2                           | 7 days                   | 100 pts. Picked from what the user has **not** done               |
| Rescue                     | "Rescue 3 meals this week"                            | 3 rescues                   | Mon–Sun                  | 100 pts + leaf badge                                              |
| Weekly breakthrough        | Any 3 verified visits this week                       | 3                           | Mon–Sun                  | A breakthrough stamp with a surprise owner perk if one is offered |
| Festival trail             | See the table below                                   | 4–6 themed shops            | Festival window + 7 days | 250 pts + a limited-edition stamp design                          |

**Festival and seasonal trails.** Dates are approximate _(verify with Nager.Date or a festival
table before showing them)_. Trails only use public streets and opening hours, and none start
after dark.

| Country   | Moment (approx. window)                                | Trail idea                                                               | Stamp art        |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------- |
| Singapore | Deepavali, 8 Nov 2026 (Little India light-up from Oct) | "Light-up trail": murukku, sweets, a garland stall, a sari tailor        | Diya             |
| Singapore | Chinese New Year, 6 Feb 2027                           | "Reunion pantry": bakkwa, pineapple tarts, mandarins, a florist          | Mandarin pair    |
| Singapore | Hari Raya Puasa, about 10 Mar 2027                     | "Bazaar evenings": kueh, rendang, baju kurung tailor (sunset hours)      | Ketupat          |
| India     | Diwali, 8 Nov 2026                                     | "Mithai and lights": sweet shop, diya maker, rangoli colours, dry fruits | Diya             |
| India     | Makar Sankranti / Pongal, 14–15 Jan 2027               | "Kite and harvest": kite shop, chikki, sugarcane, jaggery                | Kite             |
| Japan     | Shichi-Go-San, 15 Nov · autumn leaves, Nov             | "Momiji walk": wagashi, a kissaten, a stationer, a florist               | Maple leaf       |
| Japan     | New Year, 31 Dec–3 Jan                                 | "Hatsumōde trail": mochi, osechi, lucky-bag shops                        | Kagami mochi     |
| Thailand  | Loy Krathong, full moon in Nov (about 24 Nov 2026)     | "Krathong makers": a banana-leaf crafter, a florist, a sweets stall      | Krathong         |
| Thailand  | Vegetarian festival, about 9 days in Oct               | "Yellow-flag trail": jay food stalls (yellow flags)                      | Yellow flag      |
| Thailand  | Songkran, 13–15 Apr                                    | "Cool-down crawl": cha yen, a mango sticky rice stall, a water-gun shop  | Water bowl       |
| Indonesia | Ramadan (from about 8 Feb 2027) → Lebaran              | "Ngabuburit takjil": kolak, es buah, a kue stall before buka             | Bedug drum       |
| Indonesia | Independence Day, 17 Aug                               | "Merah putih": kerupuk, a flag seller, a warung kopi                     | Red-white ribbon |
| Anywhere  | Weather: first rainy week, heatwave                    | "Rainy-day comforts", "Cool spots"                                       | Umbrella / ice   |

For the demo video (18 Oct), the live trails are **Deepavali** (Singapore and India, coming up)
and Thailand's **vegetarian festival** (Oct).

**Opt-in leaderboard.** Weekly, per area, in groups of up to 30 people who joined that week
(Duolingo-style). Ranking is by **verified points this week**, with ties going to whoever got
there first. It shows display name (first name + initial), level and stamps, and **never** where
anyone went. It resets on Monday, and nobody gets demoted. Demo areas fill the board with
generated "neighbours", each labelled `Demo`, so the screen never looks empty.

**Perks the owner funds.** The owner picks a perk for each trigger in the owner app: _Regular_, a
_full shop card_ (already exists), a _quest finale stop_, or a _rescue hero_. Examples: "free kopi
upgrade", "10% off a whole cake", "first pick of the morning bake". Customers claim it in chat
("Show this to the counter") or with the current counter tap (`claimReward`). Chalkboard funds no
discounts and takes no payment. Copy on the perk: "Offered by Crumb & Courtyard. Ask at the
counter."

### 2.3 Closing-time rescue

| Element       | Spec                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner side    | The morning forecast suggests leftovers (track C). One tap posts a rescue: item(s), portions (1–20), rescue price (local currency, at least 30% off is shown), pickup window (start and end, ending at or before close)                                          |
| Customer map  | The map centres on the user and shows only shops with a live rescue. The pin pulse speeds up in the last 30 min (1.6 s → 0.8 s period). The bottom sheet lists them by **ending soonest × distance**                                                             |
| Countdown     | `mm:ss` for the last 60 min, `1 h 20 m` before that. Real end times only. Demo rescues are labelled "Demo rescue"                                                                                                                                                |
| Hold          | "Hold one for me" opens or continues the shop chat with a templated message: "Hi! Could you hold 1 × Kaya bun rescue for pickup by 7:40 pm?" The owner confirms in chat, and the portion count drops when the owner taps Confirm. **No payment and no checkout** |
| Collect       | The owner taps "Collected", or the customer scans the shop QR during the pickup window → leaf stamp + 40 pts + impact up                                                                                                                                         |
| No-show       | 2 no-shows in 30 days lose early access for 7 days. The owner can release a hold after the window ends                                                                                                                                                           |
| Impact meter  | Meals rescued (1 rescue = 1 meal), "≈ 2.7 kg CO2e avoided per meal" with an info tooltip "Estimate from Too Good To Go's published life-cycle study". Money saved = original price − rescue price, shown as the user's own total                                 |
| Milestones    | 1, 5, 12, 25, 50 meals: a leaf grows into a tree in the meter (Lottie or SVG morph)                                                                                                                                                                              |
| Notifications | Only for followed shops, at most 1 a day, quiet hours 21:00–08:00 local. "Crumb & Courtyard has 6 kaya buns to rescue until 7:45 pm."                                                                                                                            |

**Copy examples**

| Moment                 | Copy                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Map empty              | "No rescues near you right now. Most start around 6 pm. Follow shops to hear first." |
| 20 min left            | "20 min left · 3 portions"                                                           |
| Held                   | "Held until 7:45 pm. Show this chat at the counter."                                 |
| Collected              | "Rescued! That's 12 meals kept out of the bin."                                      |
| Sold out while looking | "Gone. The good news: someone rescued them. Crumb usually posts again tomorrow."     |

### 2.4 Celebration moments

All of these run at most 1.2 s, can be skipped with a tap, and under `prefers-reduced-motion`
become a 150 ms fade plus the text.

| Moment             | Motion (track A's chalk language)                                                         | Sound / haptic          | Size        |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------- | ----------- |
| Stamp              | The stamp drops, thuds (scale 1.15 → 1), chalk dust particles, the ink date writes itself | `navigator.vibrate(30)` | Full sheet  |
| First try          | As above, plus a gold rim that draws itself                                               | 2 short pulses          | Full sheet  |
| Quest step         | The quest card's next chalk line draws in                                                 | none                    | Inline      |
| Quest complete     | Badge flips 180° in 3D, confetti in the quest colour                                      | Long pulse              | Full screen |
| Level up           | The level ring closes, the title chalk-writes, the perk card slides up                    | Long pulse              | Full screen |
| Rescue collected   | The meter's leaf grows, and the number counts up                                          | Short pulse             | Sheet       |
| Weekly streak      | The week dot fills like chalk on a calendar row                                           | none                    | Inline      |
| Today's 7 finished | Cards stack into a "done" chalk tick, and the 7 am countdown appears                      | none                    | Inline      |

---

## 3. "Shock me about my neighbourhood": the Today feed

### 3.1 Format

- **Today's 7.** A vertical stack of large cards, one find each, filling about 70% of the screen
  height. You swipe or scroll from one to the next.
- **Finite.** After card 7 comes "That's today's 7", plus the passport progress and a countdown
  to 7 am local.
- **Card anatomy.** Each card has:
  - a one-line **hook** (the surprise), written as a fact in 9 words or fewer;
  - one **proof line** saying where the fact came from ("From 14 menus within 2 km");
  - one **action**: Go, Hold, Save or Start trail;
  - one small **source glyph**: Chalkboard, Google Maps, OpenStreetMap, Wikipedia, Weather or
    Demo.
- **Mixing rule.** The first 7 always include at least 1 _rescue or time-bound_ card (if one
  exists), at least 1 _place fact_ (Wikipedia/OSM), and **no more than 2 cards of any one type**.

### 3.2 Card types

| #   | Card                           | Hook example                                                       | Data source                                                                                                               | Eligible when                                                                        | Surprise score inputs                                                |
| --- | ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | **Only one within 2 km**       | "The only place within 2 km that sells kouign-amann."              | Our DB + generated menus (item index per area)                                                                            | The item appears at exactly 1 shop within 2 km, and that shop is open today          | Rarity (1/n shops), item popularity in Ask queries                   |
| 2   | **Rescue ending soon**         | "6 kaya buns, 40% off, 18 min left."                               | Rescue deals (DB, generator)                                                                                              | End time within 60 min, portions > 0, reachable on foot (walk time < remaining time) | Urgency, discount, distance                                          |
| 3   | **Hidden gem nobody's rated**  | "Open since 1987. Zero reviews online."                            | Places (`userRatingCount` < 10) or OSM shops with no Places match; generated shops with a `since` fact                    | Within 1.5 km, open today                                                            | Age (`start_date` in OSM or the generator's fact) × low rating count |
| 4   | **History under your feet**    | "These flats were Singapore's first public housing, 1936."         | Wikipedia geosearch (`list=geosearch`, radius 1 km) + a linked shop nearby                                                | An article within 800 m with a summary, and a shop within 300 m of it                | Article length, distance, whether the user has seen it               |
| 5   | **Your street's busiest hour** | "Katong's kopi rush: 7:30–9:30. Go at 10 for a seat."              | The shop's `busy_hours` field (owner-entered), generated busy hours. **Not** Google popular times (not in the Places API) | The user is within 1 km before or around the window                                  | Gap between now and the rush                                         |
| 6   | **New this week**              | "New on the menu: pandan chiffon, since Tuesday."                  | `community.py` updates (`new_item`, `back_in_stock`, `price_drop`), generated updates                                     | Update less than 7 days old                                                          | Freshness, follows                                                   |
| 7   | **Locally made**               | "Hand-stitched here: a tailor 400 m away makes every bag."         | `locally_made` flag, generator `made_here` fact                                                                           | Locally made shop not yet visited                                                    | Not visited, category variety                                        |
| 8   | **Festival trail starts**      | "Deepavali trail: 5 stops, starts today."                          | Nager.Date holidays + the festival table (§2.2) + generated trail shops                                                   | Within the festival window − 14 days                                                 | Days to the festival, the user's area                                |
| 9   | **Neighbour tip of the day**   | "'Ask for the burnt-edge kaya toast.' A Regular, 3 weeks ago."     | Tips (real first, then `Demo tip`)                                                                                        | A tip with a rating of 4 or more, or 2+ helpful marks                                | Helpful count, author level                                          |
| 10  | **Weather match**              | "Rain from 4 pm. 3 places with soup and a roof, all within 5 min." | Open-Meteo hourly forecast + shop facts (seating, categories)                                                             | Precipitation probability ≥ 60% or apparent temperature ≥ 33 °C in the next 6 h      | Weather intensity, how well the shop matches                         |

The **"Busy now" pulse** is not a card but a chip on cards 1, 3 and 7. It is drawn from demo or
aggregated stamp counts in the last 2 hours, rounded to "quiet / steady / busy", and never names
people.

### 3.3 Ranking

```
score(card) = surprise × relevance × freshness × reach × novelty
  surprise  = per-type score in [0,1] (table above)
  relevance = 1 + 0.3·[matches a stated preference] + 0.2·[follows shop] + 0.2·[category of a past stamp]
  freshness = exp(−age_hours / 48)   (rescue cards: 1 while live, 0 after)
  reach     = exp(−distance_m / 1200) · [open at its suggested time]
  novelty   = 0 if this shop or fact was shown in the last 3 days, 0.5 if it was saved but not visited, else 1
```

**Assembling the 7.**

1. Take the top candidate of each type.
2. Fill the remaining slots by score, with at most 2 cards per type and at most 1 per shop.
3. Put a rescue card first if it ends within 30 min. Otherwise lead with the top "surprise"
   card (types 1, 3 or 4), because the first card sets the tone.
4. Mark everything shown in `seen_finds` (server-side for signed-in users, `localStorage`
   otherwise), and refresh at 07:00 local.
5. If fewer than 7 qualify, show fewer. Never pad with weak cards.

**Honesty.**

- Each page shows the label "Sample neighbourhood · demo shops are generated" **once** (in line
  with the phone-density memory).
- Each card built on generated data also carries the `Demo` glyph.
- Real facts (Wikipedia, OSM, weather, Places) always carry their source glyph and attribution.

---

## 4. Demo-data generator

### 4.1 Hard rules

| Rule                                                                                                                                                                | Why                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| G1. Generate **fictional shops only**. Never generate menus, deals, tips, updates or claims for a real business (Places or OSM).                                    | Impersonation, and AGENTS.md's honesty rules               |
| G2. Generated shops get fictional names checked against real names nearby, and fictional addresses ("fictional demo address").                                      | So a demo shop can never be mistaken for a real one        |
| G3. Generated shops never use Places photos. Use category art (existing `PlaceImage` art) or a generated illustration.                                              | Photos of real places would make fictional shops look real |
| G4. Fill gaps only: `generated_count = clamp(12 − real_count_in_area, 4, 12)`, and at equal score real shops rank first.                                            | Real data always wins                                      |
| G5. Labels: ID prefix `gen-<geohash5>-<slug>`, `demo: true` on every object, the `Demo` chip, phone numbers that cannot be dialled (as the catalogue already does). | The same pattern as `demo-*`                               |
| G6. Send only the area centre (geohash5 centroid), locale, local time and weather to Gemini. Never user IDs, exact location or chats.                               | Privacy, and free-tier data terms                          |
| G7. No live dependency for the demo video. The 9 demo areas are pre-generated into fixtures, and the live call is a bonus.                                          | Quota, and a reliable recording                            |

### 4.2 Inputs

| Input                      | Source                                                                                                                                                                               | Free?                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `lat, lng`                 | Browser geolocation, or the PlaceSearch pick (as now)                                                                                                                                | n/a                                                         |
| Area name                  | Nominatim reverse geocoding (at most 1 request/s, cached; a User-Agent is required)                                                                                                  | Yes, under its usage policy                                 |
| Locale, currency, timezone | Phone locale + reverse-geocoded country → currency map (existing `to_minor` currencies)                                                                                              | n/a                                                         |
| Local time, day            | The timezone from the country, or `Intl` on the client                                                                                                                               | n/a                                                         |
| Weather                    | Open-Meteo `forecast?hourly=precipitation_probability,apparent_temperature`                                                                                                          | Yes (no key; non-commercial terms, _verify_)                |
| Real shops nearby          | Our DB (`shared_shops`) + Places `searchNearby` (only where the key is already enabled; **do not enable billing**) + Overpass `node[shop]` / `amenity=cafe/restaurant` within 1.5 km | Overpass yes (fair use). Places depends on the existing key |
| Place facts                | Wikipedia `action=query&list=geosearch&gsradius=1000` + `prop=extracts`                                                                                                              | Yes                                                         |
| Holidays                   | Nager.Date `/api/v3/PublicHolidays/{year}/{cc}` + the in-repo festival table (§2.2)                                                                                                  | Yes (_verify_ country coverage, e.g. India)                 |

### 4.3 Two calls, cached

| Call            | Contents                                                                                          | Cache key                          | Lifetime             | Model                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| **Area pack**   | 8–12 shops, menus, hours, facts, neighbour residents (for the leaderboard), area hook, 1–2 quests | `area:{geohash5}:{locale}:v1`      | 7 days               | The configured `google_text_model` (Flash class)                         |
| **Daily pulse** | Updates, rescue deals for today, tips, busy-now activity, the festival trail if one is active     | `pulse:{geohash5}:{local_date}:v1` | Until local midnight | A cheaper Flash-Lite class model if configured, otherwise the same model |

- Both are stored in the community `Documents` store (SQLite or Firestore, `kind="gen_area"`).
- A lock stops two parallel first visits from generating twice (the same issue as the
  fixed-ID demo updates).
- **Budget.** Free-tier limits are not published as a fixed table. Third-party reports for 2026
  range from about 20 to 250 requests a day for Flash models, with more for Flash-Lite
  _(verify on the project's AI Studio rate-limit page)_. Design for **50 or fewer generations a
  day**:
  - an area costs 1 call a week plus 1 a day;
  - beyond the daily budget, or on any error, fall back to the **deterministic template
    generator**: the `demo_catalogue.neighbourhood()` pattern, seeded by geohash, with menus from
    `MENUS` scaled to the local currency.
- Output tokens: about 6–8k for an area pack and about 2–3k for a pulse. Use `response_schema`
  structured output (already used in 5 backend modules) at temperature 0.9 for the area pack and
  0.7 for the pulse.

### 4.4 Prompt outline (area pack)

```
System: You create a FICTIONAL but believable set of independent local shops for a product demo.
Everything you write is labelled "demo" in the app. Never use or resemble these real business
names: {real_names[]}. Never claim to be a real business, chain or brand.
Context: area "{area}" in {country}; centre ≈ {lat:.3f},{lng:.3f}; local time {weekday} {hh:mm};
currency {ISO} (prices as integers in minor units, typical for this area); language for names and
copy: {locale}; weather now: {summary}; real categories already present: {real_categories[]}
(prefer what's missing); local facts: {wiki_titles[]}; upcoming festival: {festival|none}.
Produce {n} shops: mostly food, plus at least 3 non-food (tailor, repair, florist, hardware,
stationer…). Each has 5–9 menu items with real local names, a "since" year, 2 surprising but
plausible facts (one unique item or skill), hours that suit the category, busy hours, whether it
is locally made, and one owner voice line. Also produce {m} first-name residents for a demo
leaderboard and 1–2 quests that link 3–5 of your shops.
Write shops a local would recognise as typical but not generic (no "Best Food Shop").
```

### 4.5 Structured output schema (Pydantic, abridged)

```python
class GenItem(BaseModel):
    name: str; price_minor: int; unit: str; available: bool; group: str | None
class GenFact(BaseModel):
    kind: Literal["since", "only_here", "made_here", "skill", "story"]; text: str  # ≤ 90 chars
class GenShop(BaseModel):
    slug: str; name: str; category: str; offset_m: tuple[int, int]   # E/N offset from centre, |x| ≤ 1500
    hours: str; busy_hours: str; since: int; locally_made: bool
    halal: Literal["yes", "no", "not_stated"]; vegetarian_options: bool
    payment_methods: list[str]; items: list[GenItem]; facts: list[GenFact]
    owner_line: str; art: Literal["bakery", "kopi", "noodles", "tailor", "florist", "hardware", ...]
class GenResident(BaseModel):
    display: str            # "Mei L." — first name + initial
    level: Literal["Newcomer", "Regular", "Local Hero"]; weekly_points: int
class GenQuest(BaseModel):
    id: str; title: str; kind: Literal["crawl", "category", "festival"]; shop_slugs: list[str]; window_days: int
class AreaPack(BaseModel):
    area_hook: str; shops: list[GenShop]; residents: list[GenResident]; quests: list[GenQuest]

class GenUpdate(BaseModel):
    shop_slug: str; kind: Literal["new_item", "price_drop", "back_in_stock", "menu_confirmed"]; item: str; text: str
class GenRescue(BaseModel):
    shop_slug: str; item: str; portions: int; price_minor: int; was_minor: int
    pickup_start: str; pickup_end: str     # "HH:MM" local, must be ≤ the shop's close
class GenTip(BaseModel):
    shop_slug: str; author: str; text: str; rating: int   # ≤ 280 chars, 1–5
class GenActivity(BaseModel):
    shop_slug: str; busy: Literal["quiet", "steady", "busy"]; stamps_last_2h: int
class DailyPulse(BaseModel):
    updates: list[GenUpdate]; rescues: list[GenRescue]; tips: list[GenTip]; activity: list[GenActivity]
```

**Server-side validation after generation** (reject or repair, never trust the model):

- prices > 0 and within 3× of the category median;
- rescues end at or before close and are at least 30% off;
- each `shop_slug` exists in the pack;
- tips go through the existing `basic_filter`;
- names fail a fuzzy match against real names;
- `offset_m` is snapped away from real POIs (see below).

### 4.6 Merging with real shops without duplicates

| Step               | Rule                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Collect real    | Our DB shops → Places results → OSM nodes, merged by: same normalised name (token Jaccard ≥ 0.6) **or** (≤ 40 m apart **and** the same category family)         |
| 2. Prompt          | Pass the real names and categories in the prompt (G2, G4)                                                                                                       |
| 3. Name check      | Drop or rename any generated shop whose name has token Jaccard ≥ 0.5 with a real one, or contains a known chain name                                            |
| 4. Place           | Turn `offset_m` into lat/lng. If within 60 m of a real POI, push it outward along the same bearing in 30 m steps, at most 5 times                               |
| 5. ID namespaces   | `uuid` (real Chalkboard), `demo-*` (catalogue), `gen-<gh5>-<slug>` (generated), `place:<id>` (Places), `osm:<type>/<id>`. Rewards' ID regex must accept `gen-*` |
| 6. Ask integration | `discover_ask.ask` reads generated shops like `shared_shops` (same dict shape, with `demo: True`) so Ask, Follow, chat demo replies and tips all work           |
| 7. Precedence      | If a real Chalkboard shop later appears in the area, the next area pack shrinks (G4). Generated shops someone follows stay visible but are marked "Demo shop"   |

---

## 5. Phone flows (390 × 844)

### 5.1 Navigation (decision needed)

| Option                                                                                                           | Pros                                                            | Cons                                                       |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| **A (recommended): Today · Rescue · Passport · Chats**, Ask docked on Today, Saved inside Passport ("Following") | Each tab is one reason to come back. Ask stays where thumbs are | Moves Saved, so customer tests S3/S7 and C-7 need updating |
| B: Ask · Chats · Saved, plus Passport in the profile                                                             | Fewer changes                                                   | The gamification is hidden, against the brief              |

### 5.2 Thumb-zone heat map

```
 y=0    ┌──────────────────────────┐  Hard reach: status bar, area name, level ring chip (glance only)
        │ Tiong Bahru ▾      ◔ 240 │  ← points + ring sit top-right: seen, rarely tapped
 y=200  ├──────────────────────────┤  Stretch: card hook and photo (read, not tapped)
        │   [ FIND CARD 1 of 7 ]   │
        │   hook · proof           │
 y=520  ├──────────────────────────┤  Natural thumb zone: every primary action lives here
        │   [ Go ]  [ Save ]       │  ← card action buttons pinned to the card bottom
        │  ┌ Ask anything nearby ┐ │  ← docked Ask bar (mic on the right)
 y=764  │ Today Rescue Passport Chats│  ← nav 80 px; Rescue has a live pulse dot
 y=844  └──────────────────────────┘
```

Rules:

- Rewards _feedback_ (ring, points) goes top-right where the eye lands on open.
- Rewards _actions_ (claim a perk, start a trail, hold a rescue) always sit in the bottom 320 px.
- Tap targets are at least 48 dp.
- Nothing important goes in the 24 px around the screen edges (gesture areas).

### 5.3 Screens

| #   | Screen                          | Layout (top → bottom)                                                                                                                                              | Primary action    | States                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Welcome / location** (exists) | Chalk scene, "Find what's good near you", Use my location / Pick a place                                                                                           | Use my location   | Denied → Pick a place, with Tiong Bahru as the default and a note                                                                                                                                                                                                                                                                                     |
| 2   | **Today**                       | Area chip + level ring · demo label once · find card stack (1/7 dots) · docked Ask · nav                                                                           | Card action       | **Loading:** a chalk "sketching your neighbourhood…" skeleton over 3 cards (stays under 2 s with the cache). **Empty:** "Quiet here so far. Try a nearby area" + 3 area chips. **Error:** cached finds + "Showing this morning's finds". **Offline:** last 7 + an offline chip, actions turn into Save. **Done:** "That's today's 7" + 7 am countdown |
| 3   | **Find → Shop**                 | Shared-element card → existing shop page, with a stamp-card strip on top (uses `StampCard`)                                                                        | Chat / Follow     | The existing page states                                                                                                                                                                                                                                                                                                                              |
| 4   | **Stamp moment**                | Opened by the QR URL (`?source=qr`) → location check sheet → stamp animation → "+20 · 2 more to Regular" → the next quest step                                     | Done              | **Location off:** "Shop card stamped. Turn on location for passport points". **Too far:** "Stamps need you at the shop". **Already today:** "Already stamped today. Come back tomorrow" (no animation)                                                                                                                                                |
| 5   | **Rescue map**                  | Map (60%) with pulsing pins · bottom sheet (40%), cards sorted by ending soonest · impact meter pill on top                                                        | Hold one          | **Empty:** "No rescues right now. Most start around 6 pm". **Loading:** pins fade in. **Offline:** list only, Hold disabled                                                                                                                                                                                                                           |
| 6   | **Hold → Chat**                 | Existing thread with the templated hold message, then a demo reply "Held until 7:45 pm"                                                                            | Send              | Existing chat states (Sending / Delivered / Not sent)                                                                                                                                                                                                                                                                                                 |
| 7   | **Passport**                    | Level ring + next requirement · weekly streak row (8 weeks) · area pages as stamp-book spreads (swipe) · quests · Following (moved from Saved) · leaderboard entry | Open area / quest | **Empty (Newcomer):** a ghost stamp grid + "Your first stamp is one QR away". Signed-out: works on this phone, with "Sign in to keep it on every device" in the footer                                                                                                                                                                                |
| 8   | **Area page**                   | Hook + Wikipedia fact · 12-slot stamp grid · area quests · Regulars board (opt-in) · area facts                                                                    | Start quest       | Demo area banner once                                                                                                                                                                                                                                                                                                                                 |
| 9   | **Quest detail**                | Trail line drawn on a mini map, 3–6 stops with ticks, window countdown, reward (points + perk if any)                                                              | Start / Navigate  | Expired → "Back next season"                                                                                                                                                                                                                                                                                                                          |
| 10  | **Level up / quest complete**   | Full-screen celebration (§2.4) → the perk card slides up                                                                                                           | See perk          | Reduced motion: static card                                                                                                                                                                                                                                                                                                                           |
| 11  | **Leaderboard**                 | Join toggle (explains what's shared) · group of 30 · your row pinned to the bottom                                                                                 | Join              | Not joined: preview with blurred names, and nothing shared                                                                                                                                                                                                                                                                                            |
| 12  | **Chats** (exists)              | unchanged                                                                                                                                                          | none              | none                                                                                                                                                                                                                                                                                                                                                  |

### 5.4 The 60-second customer demo video

| t (s) | Shot                                                                                                                                                | On screen / voice-over                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 0–4   | Phone opens in Tiong Bahru at 5:40 pm; chalk scene redraws into Today                                                                               | "What's actually good near you, right now?"                            |
| 4–12  | Card 1: "The only place within 2 km that sells kouign-amann." Swipe → card 2: "These flats were Singapore's first public housing, 1936 · Wikipedia" | "Chalkboard finds what you'd never notice."                            |
| 12–18 | Card 3, a rescue: "6 kaya buns, 40% off, 18 min left" with a ticking timer → tap Hold                                                               | "Shops post what's left at closing time."                              |
| 18–24 | The chat opens with the hold message; the demo reply arrives: "Held until 7:45 pm"                                                                  | "Agree it in chat. No checkout."                                       |
| 24–31 | Cut: scan the counter QR with the camera → stamp thud, chalk dust, "+40 · Rescue"; the impact meter's leaf grows to "12 meals"                      | "Every visit stamps your neighbourhood passport."                      |
| 31–38 | Passport: level ring closes → **"You're a Regular"**, then the perk card "Free kopi upgrade · offered by Sunny Side"                                | "Owners choose the perks."                                             |
| 38–45 | Area page: stamp grid, Deepavali trail with 5 stops drawn on the map                                                                                | "Festival trails across Singapore, India, Japan, Thailand, Indonesia." |
| 45–52 | Location switch → Shimokitazawa, Tokyo: Today rebuilds in ¥ with the sketching state, and a "Momiji walk" card appears                              | "Anywhere you open it, the neighbourhood comes alive."                 |
| 52–57 | "That's today's 7 · new finds at 7 am"; the streak row shows 6 weeks                                                                                | "A reason to come back, and no endless scroll."                        |
| 57–60 | Logo · "Demo shops are generated for this demo. Facts from Wikipedia, OpenStreetMap and Open-Meteo."                                                | Honesty end card                                                       |

Recording rules:

- Use pre-generated fixtures (G7).
- Fix the clock to 17:40 SGT.
- Turn reduced motion off.
- Record at 390 × 844 at 2× scale.

---

## 6. Three-day build list

The effort scale: S ≤ ½ day, M ≈ 1 day, L ≈ 2 days for one worker. This fits the PLAN-V2 days
(16 Oct passport + rescue + generator polish, 17 Oct UX pass).

| P   | Item                                                                                                                                                     | Effort | Day   | Depends on     | Owner (suggested)  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- | -------------- | ------------------ |
| 1   | Generator v0: the deterministic template generator by geohash (reuses `neighbourhood()`/`MENUS`), `gen-*` IDs, a `shared_shops` merge, the rewards regex | M      | 15–16 | none           | Codex              |
| 2   | Generator v1: the Gemini area pack + daily pulse with `response_schema`, validation, a Documents cache, a lock, a daily budget, fallback to v0           | M      | 16    | 1              | Codex              |
| 3   | Pre-generated fixtures for the 9 demo areas (G7)                                                                                                         | S      | 16    | 2              | Codex              |
| 4   | Today feed backend: card candidates for types 1, 2, 6, 7, 9 from DB + generated data; ranking + assembly; `seen_finds`                                   | M      | 16    | 1              | Account 2          |
| 5   | Today UI: card stack, 1/7 dots, docked Ask, done state + 7 am countdown, every state, motion                                                             | L      | 16–17 | 4, theme (A)   | Claude / Account 2 |
| 6   | Nav option A (Today · Rescue · Passport · Chats); update S3/S7/C-7 tests                                                                                 | S      | 16    | owner decision | Account 2          |
| 7   | Passport backend: server stamps (QR token + location + once a day + daily cap), points ledger, levels, weekly streak + rain check, signed-out merge      | M      | 16    | none           | Codex              |
| 8   | Passport UI: level ring, streak row, area stamp book, stamp moment + level-up celebrations                                                               | L      | 16–17 | 7, A           | Claude             |
| 9   | Rescue: owner one-tap post (with track C), customer map + sheet + countdown, Hold → chat template, Collected → stamp, impact meter                       | L      | 16–17 | 7              | Account 2          |
| 10  | External facts: Wikipedia geosearch + Open-Meteo + Nager.Date clients with caching → card types 4, 8, 10                                                 | M      | 17    | 4              | Codex              |
| 11  | Quests: crawl + rescue + weekly breakthrough + one festival trail (Deepavali, plus Thai vegetarian festival for Bangkok)                                 | M      | 17    | 7, 2           | Codex              |
| 12  | Perks the owner funds: perk picker in the owner app + perk card for the customer (reuses `claimReward`)                                                  | S      | 17    | 7              | Account 2          |
| 13  | Opt-in leaderboard with demo residents                                                                                                                   | S      | 17    | 7, 2           | Account 2          |
| 14  | Overpass "hidden gem" (type 3) + "busiest hour" (type 5)                                                                                                 | S      | 17    | 10             | Codex              |
| 15  | Story walkthrough tests, axe, reduced motion, 15-locale copy keys                                                                                        | M      | 17    | all            | everyone           |
| 16  | Demo video recording (§5.4)                                                                                                                              | M      | 18    | all            | Claude             |

**Cut order if late** (cut first at the top):

1. Leaderboard (13). Show "coming soon" on the Passport.
2. Overpass gems and busiest hour (14).
3. Festival trails beyond Deepavali (11, partly).
4. Owner perk picker (12). Use a fixed demo perk on demo shops instead.
5. Live Gemini generator (2). Keep v0 templates + fixtures and label them the same way.

**Never cut:** Today's 7 with its finite end, the stamp moment, rescue with its countdown and
impact meter, the honesty labels, and reduced motion.

### Decisions for the owner (one at a time)

1. Navigation option A (Today · Rescue · Passport · Chats)?
2. Points and level thresholds as in §2.2?
3. Weekly (not daily) streaks with an auto-earned rain check?
4. Should rescue holds need sign-in? (Recommended: yes, because they go through chat.)
5. Is calling Overpass, Wikipedia, Open-Meteo, Nominatim and Nager.Date from the backend
   acceptable under the free-solution rule? (All keyless and free under fair-use terms.)

---

## Sources

- Duolingo streak analysis, as reported: [Breaking Down Duolingo's Growth Model](https://marishalakhiani.substack.com/p/breaking-down-duolingos-growth-model) · [Are streak features still spreading beyond Duolingo? (Lazyweb)](https://www.lazyweb.com/research/are-streaks-still-spreading-beyond-duolingo) · [Duolingo retention experiments (Lazyweb)](https://experiments.lazyweb.com/research/duolingo-retention-experiments.md) · [Reasons people give up a Duolingo streak (Android Authority)](https://www.androidauthority.com/reasons-give-up-duolingo-streak-3543009)
- Too Good To Go impact method (2.7 kg CO2e per 1 kg meal, Blonk LCA 2024): [Our impact calculation](https://www.toogoodtogo.com/en-gb/about-us/our-impact-calculation)
- Gemini free-tier limits (third-party, conflicting; check AI Studio): [agentdeals.dev](https://agentdeals.dev/gemini-api-pricing-changes) · [yingtu.ai](https://yingtu.ai/en/blog/google-gemini-api-free-tier-limits-2026) · [tinkerllm.com](https://tinkerllm.com/blog/gemini-api-free-tier-limits-rate-quotas/)
- Other mechanics (Pokémon GO research breakthroughs, Strava Local Legends and privacy zones,
  Swarm's 2014 split, Snap Map Ghost Mode, Starbucks challenges and star changes, Local Guides
  levels, Xiaohongshu notes) are from general product knowledge and were not re-checked this
  session _(verify before quoting in the pitch)_.
