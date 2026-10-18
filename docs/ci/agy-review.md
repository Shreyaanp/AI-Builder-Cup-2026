# AGY PR review (free, advisory)

Every PR to `main` from a branch of this repo gets one review comment written by the Antigravity CLI
(`gemini-3.8-flash-medium`) running on the owner's PC. It costs nothing and is **advisory**: the job
never fails the PR and must not be added as a required check.

## How it works

- Workflow: `.github/workflows/agy-review.yml`, triggered on `pull_request` (opened, synchronize,
  ready_for_review) against `main`, skipped for drafts.
- Runner: self-hosted `chalkboard-pc` (labels `self-hosted,windows,agy`) in `C:\actions-runner`.
- The job fetches the diff with `gh pr diff`, writes it plus the title and body to a temp folder, and runs
  `agy -p` in plan (read-only) mode with a review prompt built from our rules (frozen landing files,
  phone first, no duplicates or removed features, i18n, currency by region, security, production risk).
  The diff is cut at 300,000 characters. It then posts one comment with `gh pr comment`.
- Concurrency is per PR (a newer push cancels the older review); timeout is 20 minutes.
- If Antigravity is out of quota or errors, the job logs that and posts nothing.
- The runner starts at logon through the Scheduled Task `chalkboard-agy-runner`, as the user, because
  the job needs this user's `agy` and `gh` logins. (Installing it as a Windows service needs an
  administrator shell and a service account with those logins; `config.cmd --runasservice` was not
  possible from the non-elevated session that set this up.) The PC must be on and signed in for reviews.

## Security guard (public repo + self-hosted runner)

Fork code must never run on this PC. So:

- The job only runs when `github.event.pull_request.head.repo.full_name == github.repository`.
- The trigger is `pull_request`, never `pull_request_target`.
- The job does not check out or execute PR code; it only reads the diff through the API. Title, body and
  diff are passed as files and the prompt tells the model to treat them as untrusted data.
- Repo setting "Approval for running fork pull request workflows" is set to
  `all_external_contributors` (Settings > Actions > General).
- Keep this workflow free of `actions/checkout` and of any step that runs repo scripts.

## Stop or remove the runner

```powershell
Stop-ScheduledTask chalkboard-agy-runner                  # stop it now
Disable-ScheduledTask chalkboard-agy-runner               # do not start at logon
Stop-Process -Name Runner.Listener,Runner.Worker -Force -ErrorAction SilentlyContinue  # if still running
# remove it for good
Unregister-ScheduledTask chalkboard-agy-runner -Confirm:$false
cd C:\actions-runner; .\config.cmd remove --token <token from: gh api -X POST repos/Shreyaanp/AI-Builder-Cup-2026/actions/runners/registration-token --jq .token>
```

With the runner offline the job just waits in the queue and the PR is unaffected. To switch the review
off without touching the PC, disable the workflow: `gh workflow disable agy-review.yml`.
