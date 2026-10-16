# Agent tool coverage: every feature by voice

Audit of 16 Oct 2026 (branch `feat/voice-everything`). For each owner and customer feature: how it
is done by conversation (voice or text), and what still needs a tap. Every write keeps the existing
boundary: the coach prepares, and the owner confirms in the review dialog, taps Send, or confirms
on the page the coach opens. Nothing is saved, sent, published or deleted by the model.

Legend: **Voice** = done end to end by conversation (plus the usual confirm tap). **Voice → tap** =
the coach opens the right screen at once; one owner tap finishes it (file pickers and camera
only open from a tap; deletion always asks to confirm). **Gap** = not by voice yet.

The "Instant" column marks requests answered by `backend/app/instant.py` before any model call.

## Owner (business app)

| Feature                                                  | How by voice                             | Tool / path                                                                         | Instant | Status                           |
| -------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- | ------- | -------------------------------- |
| Tell the coach about a new shop                          | "I run a tea stall in Indiranagar"       | `propose_business`, `propose_products`, `propose_customer_facts` (new-shop mode)    |         | Voice                            |
| Edit shop details, weekly hours                          | "We open 7 to 9, closed Sundays"         | `propose_business` (`weekly_hours`)                                                 |         | Voice                            |
| Add items and prices                                     | "Add masala chai 15 a cup"               | `propose_products`                                                                  |         | Voice                            |
| Menu from a photo                                        | photo + "add these"                      | `propose_products` (multimodal)                                                     |         | Voice → tap (photo)              |
| Price change                                             | "Samosa is 20 now"                       | `propose_products`                                                                  | yes     | Voice                            |
| Sold out / back in stock                                 | "Samosa is sold out", "samosa is back"   | `propose_products`                                                                  | yes     | Voice                            |
| Closed today / open again today                          | "We're closed today"                     | `set_open_today` (new), `closed_on` field                                           | yes     | Voice                            |
| Customer facts (halal, payment, delivery, type-specific) | "We take UPI and cash"                   | `get_question_plan`, `propose_customer_facts`                                       |         | Voice                            |
| Stamp card (reward, visits)                              | "Free chai after 8 visits"               | `propose_stamp_card` (new)                                                          |         | Voice                            |
| Read customer questions                                  | "Any messages?"                          | `get_customer_messages` (new)                                                       | yes     | Voice                            |
| Reply to a customer                                      | "Tell her we deliver after 6"            | `prepare_customer_reply` (new) → reply card, owner taps Send                        |         | Voice                            |
| Rescue leftovers deal                                    | "Rescue 6 croissants at 30% off until 8" | `propose_rescue_deal`                                                               |         | Voice                            |
| Share my page / QR                                       | "Share my page", "show my QR"            | `open_screen("share")` (new)                                                        | yes     | Voice → tap (switch page on)     |
| Get on Google next step                                  | "What's my next Google step?"            | `open_screen("google")`, `explain_app`                                              | yes     | Voice → tap (Google's own pages) |
| Connect POS / import sales                               | "Connect my POS"                         | `open_screen("import")` → file picker chip                                          | yes     | Voice → tap (pick file)          |
| Close the day                                            | "Close the day"                          | `open_screen("close_day")`                                                          | yes     | Voice → tap (photo)              |
| Add a shop or menu photo                                 | "Add a photo"                            | `open_screen("photo")` → picker chip                                                |         | Voice → tap (pick photo)         |
| Remove a shop photo                                      | "Remove my shop photo"                   | `open_screen("details")`                                                            |         | Voice → tap (remove)             |
| Privacy: download or delete my data                      | "Delete my data"                         | `open_screen("privacy")`; always confirmed there                                    | yes     | Voice → tap (confirm)            |
| Optional face check                                      | "Verify me"                              | `request_registration`                                                              |         | Voice → tap (camera)             |
| How much to prepare                                      | "How much chai tomorrow?"                | `get_forecast` (chart card)                                                         |         | Voice                            |
| Plan tomorrow                                            | "Plan tomorrow"                          | `open_screen("plan")`                                                               | yes     | Voice → tap                      |
| How business is going                                    | "How is business this week?"             | `get_insights` (chart card)                                                         |         | Voice                            |
| Find suppliers, order, message, cancel                   | "My flour is running low"                | `find_suppliers`, `prepare_order`, `get_orders`, `message_supplier`, `cancel_order` |         | Voice (Send is a tap)            |
| Teach the coach                                          | "Remember: closed Mondays"               | `remember_note`                                                                     |         | Voice                            |
| "How do I…?" about the app                               | "How do I share my page?"                | `explain_app` (new), app guide `backend/app/app_guide.py`                           | yes     | Voice                            |
| What else could I sell                                   | "What else do tea shops sell?"           | `suggest_starter_items` (new), templates `backend/app/starter_templates.py`         |         | Voice                            |
| Am I open? / my hours / what's sold out                  | "Am I open?"                             | instant read of saved data                                                          | yes     | Voice                            |
| Delete a remembered note                                 | —                                        | My shop → notes                                                                     |         | Gap                              |
| Sort my menu into sections                               | —                                        | "Sort my menu" button                                                               |         | Gap                              |
| Perks beyond the stamp card (regulars, full card)        | —                                        | API only (`PUT /perks`), no owner screen yet                                        |         | Gap                              |
| Demand radar (what nearby customers search)              | —                                        | Today/Grow cards                                                                    |         | Gap                              |
| Mark a supplier order received                           | —                                        | Order card button                                                                   |         | Gap                              |

## Customer (explore app)

| Feature                          | How by voice                                | Path                                                       | Instant | Status                              |
| -------------------------------- | ------------------------------------------- | ---------------------------------------------------------- | ------- | ----------------------------------- |
| Find food and shops nearby       | "Cheap vegetarian breakfast near me"        | `POST /discover/ask` (Gemini intent → real menus + Google) |         | Voice                               |
| Preferences (veg, halal, budget) | said in a search                            | remembered for signed-in customers                         |         | Voice                               |
| My stamps                        | "Show my stamps"                            | ask command `my_stamps` → passport                         | yes     | Voice                               |
| Directions                       | "Directions to Asha Bakery"                 | ask command `directions` → walking route card              | yes     | Voice → tap (open Maps)             |
| Follow a shop                    | "Follow Asha Bakery"                        | ask command `follow` → shop page                           | yes     | Voice → tap (Follow; needs sign-in) |
| Ask the owner                    | "Ask Asha Bakery if they have eggless cake" | ask command `ask_owner` → shop page                        | yes     | Voice → tap (send)                  |
| Collect a stamp                  | —                                           | scan the shop's QR (camera)                                |         | n/a (physical scan)                 |
| Hold a rescue deal               | —                                           | deal card button                                           |         | Gap                                 |
| Leave a tip for other customers  | —                                           | shop page                                                  |         | Gap                                 |

## Instant path rules (owner)

Rules run only for a saved shop, plain-Latin messages up to 200 characters (other languages and
scripts always go to Gemini), never in new-shop mode. Writes (`propose_products`,
`set_open_today`) only prepare reviews. Optional Vertex embeddings (`INSTANT_EMBEDDINGS=true`)
match paraphrases only to read-only or navigation intents, at cosine ≥ 0.86, with exemplar and
query vectors cached; anything unsure goes to the model. Instant turns are written to the ADK
session, so the coach sees them on the next turn.

## Tests

- `backend/tests/test_voice_everything.py`: every new tool, closed-today end to end, the instant
  router (rules, embedding cache, fallbacks, HTTP history + latency), starter templates, context
  cache switch, customer commands.
- `tests/voice-everything.spec.ts`: sold-out review at once, "share my page" opens the sheet,
  "how do I…" answered from the guide.
- `backend/scripts/coach_eval.py`: 8 voice-everything scenarios (closed today in English and
  Hindi, share page, delete data never claimed, stamp card, messages, app guide, starter items).
  Live Gemini only; not run in this change (no paid calls).
