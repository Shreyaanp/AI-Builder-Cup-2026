# Uploads and the shop icon

## Shop icon API (for onboarding v2 to call at the end of onboarding)

All owner routes need the owner sign-in and consent; `{bid}` is the business id.

| Call                                                         | Does                                                                                                       | Errors                                                                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/businesses/{bid}/icon`                          | `{icon, ai_available}`                                                                                     | 404 not your shop                                                                                                                             |
| `POST /api/v1/businesses/{bid}/icon/generate`                | Gemini image model draws a square icon from name + kind + region; returns `{icon, source: "ai"}`           | `503 ICON_AI_OFF`, `503 ICON_UNAVAILABLE` (old icon kept, show the monogram), `429 ICON_DAILY_LIMIT` (3 per shop per UTC day, failures count) |
| `PUT /api/v1/businesses/{bid}/icon`                          | Body is a JPEG/PNG/WebP photo; moderated, centre-cropped to 512 px, saved once; `{icon, source: "upload"}` | 413 too large, 415 wrong type or unreadable, moderation codes                                                                                 |
| `POST /api/v1/businesses/{bid}/icon/from-gallery/{photo_id}` | Use a gallery photo as the icon                                                                            | 404                                                                                                                                           |
| `DELETE /api/v1/businesses/{bid}/icon`                       | Remove it (monogram returns)                                                                               |                                                                                                                                               |
| `GET /api/v1/businesses/{bid}/icon/{id}.jpg`                 | Owner image                                                                                                |                                                                                                                                               |
| `GET /api/v1/public/shops/{bid}/icon/{id}.jpg`               | Public image (shared shops only, immutable cache)                                                          | 404                                                                                                                                           |

`icon` (the id, or null) is on the owner business and on `GET /public/shops/{bid}`; discovery places carry `icon_url`.
Settings: `SHOP_ICON_AI` (switch, off by default, on in deployment/runtime-config.py), `SHOP_ICON_MODEL`
(`gemini-3.1-flash-lite-image`, the image model available in project `ichiropractic`), `SHOP_ICON_LOCATION`
(`global`), `SHOP_ICON_DAILY_LIMIT` (3). Without AI, or on failure, the app draws a themed monogram.

Voice/AI tools: `make_my_icon` and `use_photo_as_icon` open the icon card (Shop → Shop details); the
owner taps there, the coach never claims it was made.

In the app: Shop → Shop details → Shop icon card (Make my icon / Upload a picture / Remove). The picture
is centre-cropped to a square in the browser before upload, and shows on the customer page header.

## Live generation (recorded once, project ichiropractic)

`docs/qa/icon-live/courtyard-chai.jpg`: "Courtyard Chai", Tea stall, Bengaluru, India; model
`gemini-3.1-flash-lite-image`, one call. The model drew the symbol with a pale margin around a coloured
square; the server crops to the centre square but does not trim that margin.

## Tests

- Backend `tests/test_shop_icon.py`: stubbed generator, square output, 3 per day, failure keeps the old icon,
  AI off, upload replace/remove, wrong types, gallery photo, owner-only.
- Browser `tests/shop-icon.spec.ts` (phone): upload then remove, Make my icon with AI off shows an error and
  the monogram, offline says so.
- Existing upload specs re-run green after this change: `import.spec.ts` (POS menu + sales import),
  `close-day.spec.ts` (till photo), `new-shop.spec.ts` (menu photo in chat), `bugs-b37.spec.ts` (gallery
  upload), `myshop.spec.ts`, `phone-regressions.spec.ts`, `owner-audit.spec.ts`.

## Not covered by this pass

The brief asked for a walk of every upload at 360 px with camera/gallery, HEIC, huge files, permission
denied and cancel. Only the icon upload got new offline/error tests; the other uploads were checked by their
existing specs above. Not re-walked by hand: shop photo, product photo, invoice/receipt (Document AI) and
the face check on a real phone; HEIC is not accepted by the icon route (the app falls back to sending the
original, and the server answers 415 with a clear message).
