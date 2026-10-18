# Owner reminders

Reminders are optional and off by default. You → Settings → **Remind me** is the only place
that requests notification permission. Turning it off removes this device's server subscription,
then unsubscribes in the browser. Web use continues without notification permission.

Server configuration (environment names only; do not put values in source or logs):

- `WEB_PUSH_ENABLED=true`: server feature switch, default false.
- `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY`: matching P-256 VAPID pair, unpadded base64url
  public uncompressed point / private 32-byte scalar. Unset or invalid means off.
- `WEB_PUSH_SUBJECT`: operator contact as `mailto:` or HTTPS URL, required by VAPID.
- `REMINDERS_CALLER`: permitted Scheduler service-account email.
- `REMINDERS_AUDIENCE`: exact OIDC audience (the Cloud Run service origin).

Subscriptions live in the existing merchant document adapter (`push_subscriptions`), scoped to
the verified owner, with up to five devices per owner. Each device chooses the active shop and
English or Hindi when enabled. Other locales currently receive English pushes. To change that
shop/language, turn reminders off and on. Production uses the existing Firestore namespace;
SQLite is only for local use. Delete all my data also erases reminder subscriptions.

`POST /api/v1/internal/reminders/send` verifies a Google OIDC token's audience, email and verified
email claim. Owner cookies/Firebase tokens alone do not authorize it. The route is absent when
push is off. It never calls an AI model. Standard encrypted Web Push goes directly to the
browser's push provider; no paid notification broker is involved. Supported endpoints are
Chrome/Edge (FCM), Firefox and Apple; arbitrary URLs, ports and redirects are rejected.

Every five minutes, the scheduler checks the last fifteen minutes for an opening or closing
transition using the shop's saved hours and timezone. Weekly closed days, closed-today overrides,
overnight hours and timezone offsets are respected. Unknown hours have no reminders. Morning
pushes count unanswered customer threads plus inventory items with known stock at five or fewer;
zero skips the push. Evening pushes say **Close the day**. Notification clicks open/focus the
owner app. Payloads contain no customer messages or shop name.

Atomic per-device leases prevent concurrent scheduled runs from sending the same event twice.
Success is remembered per local date and reminder kind; 404/410 removes expired subscriptions.
Transient failures can retry during the fifteen-minute window. A cancelled sender's lease expires
after two minutes. Network ambiguity after a provider accepts a push can still cause a retry;
stable notification tags replace the earlier notification. This is best-effort delivery, not an
exactly-once or alarm guarantee. Scheduler downtime beyond the window skips old reminders.
The scan refuses more than 1,000 owned shops pending pagination, rather than silently skipping.

## Scheduler reference — do not run as part of this change

No job, cloud resources, IAM or billing changes are made here. Use an existing eligible free
allowance only; this reference does not establish free quota or authorize spending. The existing
caller must already be eligible to invoke the service. Configure the server caller/audience to
match the placeholders below; do not add secrets to the job.

```sh
gcloud scheduler jobs create http owner-reminders \
  --project=PROJECT_ID \
  --location=REGION \
  --schedule='*/5 * * * *' \
  --time-zone=UTC \
  --uri='https://SERVICE_ORIGIN/api/v1/internal/reminders/send' \
  --http-method=POST \
  --oidc-service-account-email='EXISTING_SCHEDULER_ACCOUNT' \
  --oidc-token-audience='https://SERVICE_ORIGIN' \
  --attempt-deadline=180s \
  --max-retry-attempts=2
```

Real phone permission, installed iOS support, live provider delivery, Firestore concurrency and
Cloud Scheduler invocation require separate validation. Local tests use ephemeral fixture keys,
mock transports and browser push substitutes; they never contact a push service or Google auth.
