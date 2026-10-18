# AGY PR review (free, advisory)

Eligible PRs to `main` get an advisory review comment from the Antigravity CLI
(`gemini-3.8-flash-medium`) running on the owner's PC. The job never fails the PR and must not be
added as a required check.

## How it works

- Workflow: `.github/workflows/agy-review.yml`, triggered on `pull_request` (opened, synchronize,
  ready_for_review) against `main`, skipped for drafts.
- Runner: self-hosted `chalkboard-pc` (labels `self-hosted,windows,agy`) in `C:\actions-runner`.
- The job runs only for same-repo, non-draft PRs when the PR author or triggering actor is `Shreyaanp`.
- It fetches the diff with `gh pr diff` in a token-bearing step, writes the diff and title/body to a
  temp folder, then runs `agy -p` in plan (read-only) mode in a separate step. The agy step has no
  `GH_TOKEN` or `GITHUB_TOKEN`; it also removes those variables from its process environment before
  starting the CLI. The title, body and diff are explicitly delimited as untrusted data, and the prompt
  says not to follow any instructions in them. The diff is cut at 300,000 characters.
- A third step uses a token to post the review with `gh pr comment`.
- Concurrency is per PR (a newer push cancels the older review); timeout is 20 minutes.
- If Antigravity is out of quota or errors, the job logs that and posts nothing.
- The runner starts at logon through the Scheduled Task `chalkboard-agy-runner`, as the user, because
  the job needs this user's `agy` and `gh` logins. (Installing it as a Windows service needs an
  administrator shell and a service account with those logins; `config.cmd --runasservice` was not
  possible from the non-elevated session that set this up.) The PC must be on and signed in for reviews.

## Security guard (public repo + self-hosted runner)

Fork code must never run on this PC. So:

- The job only runs when `github.event.pull_request.head.repo.full_name == github.repository`, the PR
  is not a draft, and `github.event.pull_request.user.login == 'Shreyaanp' || github.actor == 'Shreyaanp'`.
- The trigger is `pull_request`, never `pull_request_target`.
- The job does not check out or execute PR code; it only reads the diff through the API. `GH_TOKEN`
  is scoped to the diff-fetch and comment-post steps, never the Antigravity step. Title, body and diff
  are delimited in the review inputs and the prompt tells the model to treat them as untrusted data.
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
