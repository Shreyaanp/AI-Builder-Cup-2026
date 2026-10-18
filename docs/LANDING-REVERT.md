# Landing page switch and one-command revert

The customer host `/` (chalkboard.shreyaan.work) can show two pages. The runtime setting
`LANDING_VARIANT` picks one; the page reads it from `/api/v1/bootstrap`, so changing it needs
**no rebuild**.

| Value               | Page                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| `classic` (default) | The existing Marketing landing (`Marketing.tsx`, `landing.css`)                   |
| `new`               | The one-story page (the `/landing-preview` layout, `HowItWorks.tsx` with `front`) |

## Go back to the classic page (one command)

```
gcloud run services update ogoogle-ai --region asia-south1 --project ichiropractic --update-env-vars LANDING_VARIANT=classic
```

## Switch to the new page

```
gcloud run services update ogoogle-ai --region asia-south1 --project ichiropractic --update-env-vars LANDING_VARIANT=new
```

A deploy writes the value from the GitHub variable `LANDING_VARIANT` (default `classic`), so set
that variable too if you want `new` to survive the next deploy.

Preview either page without changing anything: `/?landing=new` or `/?landing=classic`.

## Snapshot

- Git tag `landing-classic-2026-10-18` is `origin/main` before this change.
- Screenshots of the live page that day: `docs/landing-snapshot-2026-10-18/` (phone 390, desktop 1280).
