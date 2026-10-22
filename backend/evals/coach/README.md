# Owner coach evals (OB-173, #532)

Does the owner coach pick the right action with the right arguments, ask when it should, say
honestly when it can't, and never act on a plain question? 37 cases from real owner chats and
known failures (English, 5 Hinglish), each run through the production ADK agent
(`app/agent.py`) and its real tools on a throwaway SQLite shop.

| File                  | What it is                                                          |
| --------------------- | ------------------------------------------------------------------- |
| `cases.py`            | The cases: what the owner says, expected calls, card, rubric        |
| `seeds.py`            | Synthetic shops (tea stall, kirana with sales, POs, supplier order) |
| `harness.py`          | Runs a case, collects calls, cards and reply, scores each turn      |
| `test_coach_evals.py` | The offline suite CI runs (`coach-evals` job in `checks.yml`)       |
| `test_harness.py`     | Checks on the checks, including cases built to fail                 |
| `__main__.py`         | Command line: offline table, or live Gemini with pass^3             |

## Two modes

**Offline (CI, free, deterministic).** A replay model makes exactly the calls each case expects.
This proves the expected trajectory is valid against today's code: every tool exists and
accepts the arguments, the approval card appears or does not, ids carry across turns (find
suppliers → order the cheapest → make it 15 kg), and state checks such as "the map pin moves"
hold. It does **not** test whether Gemini would choose these calls; reply checks are skipped
because the reply is canned.

```sh
cd backend
uv run pytest evals -q -rxX        # what CI runs
uv run python -m evals.coach       # the same cases as a table
```

**Live (by hand, costs money).** Real Gemini chooses the tools and writes the reply; every
check applies, including the reply patterns, "asks exactly one question" and no internal field
names. Each case runs 3 times and the summary reports pass^3 (a case counts only if all 3 runs
pass) and the per-trial rate.

```sh
cd backend
GEMINI_BACKEND=api_key GOOGLE_API_KEY=... uv run python -m evals.coach --live
GEMINI_BACKEND=vertex GOOGLE_CLOUD_PROJECT=... uv run python -m evals.coach --live   # ADC
# --only menu,ambiguous   --trials 5   --model gemini-...   --out live.json
```

Live runs never touch production data: the shops are synthetic and the store is a temp file.

## Add a case from a real chat

1. Take the owner's message from the chat (or the OB issue). Remove anything personal: write the
   words yourself with a synthetic shop, name and number (`+91 90000 0000x`).
2. Pick a seed in `seeds.py` that has what the turn needs, or add one (synthetic only).
3. Add a `Case` to `cases.py` in its group. For each turn:
   - `calls`: the tool calls that must happen, with only the arguments that matter
     (`"~regex"`, `ANY`, `"$thread"`-style ids found earlier, `"a|b"` for either key). If
     `args` uses patterns, give `replay` with concrete values for the offline run.
   - `forbid`: tools that must not run (`QUESTION_SAFE` for questions: no writes, no card).
   - `card`: `True` if an approval card must appear, `False` if none may.
   - `ask=True` for an ambiguous ask; `reply_has` / `reply_not` regexes for the live reply.
   - `rubric`: one line on what a good reply does, for whoever reads a failure.
4. If it fails today, set `known="#<issue>: what is wrong"`. It runs as xfail (strict). Never
   delete it and never change the prompt in the same PR to make it pass: the eval measures, a
   fix PR fixes. When the fix lands the case passes, strict xfail fails the run, and the fix PR
   removes `known`.
5. Run `uv run pytest evals -q` and, for prompt or tool changes, a live run of the group.

## Why pytest and not `adk eval`

ADK's evaluator wants an agent module and JSON eval sets, and its rubric metrics call a judge
model. The coach's tools read the signed-in owner and shop from a per-turn context
(`coordinator.current`), which the ADK evaluator does not set, and CI must stay free. The
harness keeps ADK's ideas (tool trajectory with argument matching, a rubric per turn) in
pytest.

## Known failures today

- `location_move_hitec_city` (#531, #527): "move my shop to HITEC City" prepares the new place
  name but keeps the old map pin; nothing geocodes it.
