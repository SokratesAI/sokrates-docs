---
on:
  # Explicit rather than gh-aw's fuzzy `weekly`, because the hour is the fix.
  # This key is shared with the newspaper CronJobs in SokratesAI/platform-config
  # and Edvard has confirmed (capture, 2026-09-01) there is no second Gemini key
  # to be had -- so the one key gets time-sliced instead of duplicated.
  #
  # Google's free-tier requests-per-day counter resets at midnight Pacific,
  # which is 07:00 UTC on PDT and 08:00 UTC on PST. 08:20 UTC is inside the
  # fresh quota day under both offsets, and it is ahead of every scheduled
  # Gemini spender on this project:
  #
  #   newspaper-generator      00:00 UTC daily   (~1000 free calls, the big one)
  #   newspaper-rss-refresh    10:00 UTC daily
  #   newspaper-suggestions    23:00 UTC Saturday
  #
  # The old slot was `7 5 * * 5` -- 05:07 UTC, which is 22:07 PDT: the last
  # hour of the Pacific quota day and five hours downstream of the generator's
  # nightly run. Every scheduled run this workflow has ever made fired in that
  # window (05:43, 06:14, 06:23 UTC) and every one of them failed; both runs
  # that have ever succeeded on a quota-limited model fired in the fresh
  # window instead (12:40 UTC = 05:40 PDT on 08-07, 14:50 UTC = 07:50 PDT on
  # 09-01). This is correlation over a handful of runs, not a proof -- run
  # 33139454138 succeeded at 03:37 UTC, inside the exhausted window, so the
  # nightly spend clearly varies. What is not in doubt is the direction: at
  # 08:20 UTC nothing scheduled has spent against this project yet, and at
  # 05:07 UTC everything has.
  schedule:
    - cron: "20 8 * * 5"
  workflow_dispatch:  # manual trigger for testing

permissions:
  contents: read
  issues: read
  pull-requests: read

engine: gemini
# gh-aw's default gemini model (gemini-2.5-flash-lite) is deprecated for
# new API keys and fails over to a Pro-tier model, which then hits daily
# quota exhaustion on this key -- it's shared with Agora's live traffic
# (see vault Projects/Sokrates/Projects/Sokrates-Docs/_context.md).
#
# 2026-08-07: switched to the rolling `gemini-flash-latest` alias, on the
# reasoning that Flash is free by construction (Pro models require
# billing; Flash doesn't) and an alias never goes stale the way a pin
# does. That reasoning had a hole and it took the workflow down for three
# weeks -- every scheduled run from 2026-08-14 onward failed.
#
# 2026-08-27: measured, not guessed. `gemini-flash-latest` now resolves to
# `gemini-3.7-flash` (one generateContent call against this project's key;
# the response's `modelVersion` field says so). Google's free tier for that
# model is 5 requests/minute and 20 requests/day -- its own 429 body names
# the numbers: "Quota exceeded for metric:
# generativelanguage.googleapis.com/generate_content_free_tier_requests,
# limit: 20, model: gemini-3.7-flash". A docs-sync run makes ~31 model
# turns (run 33031195723 reported `tool_calls: 31`, 500,429 input tokens),
# so it cannot fit inside 20 requests. I did not test a second key, so I
# cannot say the limit is per-key rather than per-project -- what I can
# say is that 20 is smaller than 31, so no amount of key-swapping makes
# THIS model work.
#
# So the rolling alias is not neutral here -- it drifts *toward* tighter
# quota by construction, because Google gives its newest models the
# smallest free tiers and the alias always points at the newest one. A pin
# to a settled model is the low-maintenance choice, which is the opposite
# of what the 2026-08-07 note concluded.
#
# The 20/day cap is NOT specific to the newest model. Tried gemini-3.5-flash
# first on the theory that a settled model carries a wider free tier; run
# 33034450016 refused it after 6 tool calls with the identical message,
# "limit: 20, model: gemini-3.5-flash". So the whole Flash line is capped at
# 20 free requests a day on this project, and picking a different Flash
# model does not buy headroom on its own.
#
# gemini-3.5-flash-lite is the pin, and it is the only model here with
# direct evidence of a wider tier rather than an assumption: the
# newspaper-generator CronJob in SokratesAI/platform-config runs several
# hundred free-tier calls a night against this same project on
# gemini-3.5-flash-lite and succeeded most recently 2026-08-26T22:00Z.
# Lite is a weaker model than Flash for this kind of fact-checking work,
# and that is a deliberate trade: a weaker run that completes beats a
# stronger one that dies at 20 requests.
#
# 2026-08-27, measured: it exhausts too. Run 33034688172 refused it after
# ONE tool call -- "limit: 500, model: gemini-3.5-flash-lite". The wider
# tier is real and it is already spent: the newspaper-generator and
# newspaper-rss-refresh CronJobs run ~1000 free calls a night against this
# same project, and gemini-3.5-flash-lite is what they use.
#
# So the whole question is settled, on this project's key, in one hour:
#
#   gemini-3.7-flash        limit 20/day    (run 33031195723)
#   gemini-3.5-flash        limit 20/day    (run 33034450016)
#   gemini-3.5-flash-lite   limit 500/day   (run 33034688172), already spent
#
# No model choice makes docs-sync green on this project's key AT THE HOUR
# IT WAS RUNNING. What would work is flash-lite with 500/day to itself: a run
# needs ~31 requests, which is ~16x headroom, and the only reason it failed
# is that the newspaper jobs spent the day's allowance first.
#
# 2026-09-01, Edvard's answer to that: "I do not have a second Gemini key. We
# either need to share it or figure something out". So a dedicated credential
# is off the table and sharing is the instruction -- which is what the `on:`
# block above now does, by moving the run into the part of the Pacific quota
# day that no scheduled job has spent against yet. A day is 500 requests and
# a run needs 31; the contention was never about volume, it was about order.
# gh-aw v0.84.3 has no Groq engine, so the Groq path (issue #117) still means
# a newer gh-aw or a custom engine (see
# nova/resources/research/gh-aw-groq-2026-08.md) -- it is no longer the only
# way out.
#
# The pin stays on flash-lite anyway, because it is the only one of the
# three that CAN work: 20/day can never fit a ~31-turn run under any
# circumstances, whereas 500/day fits it comfortably the moment the
# contention goes -- either a dedicated key, or the newspaper batching
# already on the backlog, which cuts that job's spend about 20x.
#
# Do not spend another cycle testing model pins. The numbers are above.
#
# When this pin does eventually need moving, move it to another *settled*
# model. Do not put the alias back.
model: gemini-3.5-flash-lite

# 2026-08-07: closes the gap this workflow itself reported (see
# docs/reference/docs-sync.md's "Known gaps" section and the first
# missing-tool report, run 31179199461) -- read-only access to the repos
# whose source of truth this site's reference section actually describes.
# Reuses sokrates-ci-deployer (already installed org-wide, contents:write
# at the App level) rather than provisioning a new credential -- scoped
# down per-token to just these repos via the `repositories` input, same
# pattern as build.yaml's update-manifest job uses for its own narrower
# (single-repo) token.
pre-agent-steps:
  - uses: actions/create-github-app-token@v1
    id: docs-read-token
    with:
      app-id: ${{ secrets.ORG_APP_ID }}
      private-key: ${{ secrets.ORG_APP_PRIVATE_KEY }}
      owner: SokratesAI
      repositories: platform-config,sokrates-cli,operator,sokrates-docs

tools:
  github:
    github-token: ${{ steps.docs-read-token.outputs.token }}
    allowed-repos:
      - sokratesai/platform-config
      - sokratesai/sokrates-cli
      - sokratesai/operator
      - sokratesai/sokrates-docs
    # Only trust merged content from these repos as source of truth --
    # this workflow verifies reference docs against them, so an open PR
    # (potentially unreviewed, in the untrusted-content sense) must never
    # be read as if it were the real current state.
    min-integrity: merged
    toolsets: [default]

network: defaults

safe-outputs:
  create-pull-request:
    title-prefix: "[docs-sync] "
    labels: [documentation, automated]
    max: 1
  # missing-tool reporting is enabled by default -- no config needed.
---

# docs-sync

Keep the **Reference** section of this Diátaxis-structured docs site
(`docs/reference/`) accurate and free of rot. Tutorials, how-to guides, and
explanation content are out of scope — those need human judgment about
what's worth teaching, not just fact-checking.

## Instructions

1. Read every file under `docs/reference/`.
2. Check for internal consistency problems, and verify factual claims
   against real source of truth where you now have read access to it:
   - Broken internal links (links to `docs/` pages that don't exist).
   - Pages whose content contradicts another reference page.
   - Placeholder/stub pages (e.g. "No reference pages yet") that are
     stale relative to what the rest of the site now documents elsewhere.
   - **CRD/API claims against their real source**: `docs/reference/
     github-service.md` describes the `GitHubService` CRD — verify its
     field table against the live schema at `SokratesAI/platform-config`
     `crossplane/githubservice-xrd.yaml`, and its "what gets created"
     section against `crossplane/githubservice-composition.yaml`. You
     have read access to `SokratesAI/platform-config`,
     `SokratesAI/sokrates-cli`, and `SokratesAI/operator` via the GitHub
     tool — use it. Do not guess field names, defaults, or behavior;
     read the actual file.
3. If you find something you can fix directly and confidently, make the
   edit.
4. If checking a claim properly would require reading a repo you don't
   have access to, do NOT guess or fabricate reference content. Use the
   `missing-tool` safe output to report which repo and why, AND add or
   update an entry under "Known gaps" in `docs/reference/docs-sync.md`
   (create the file section if missing) so the gap is a durable, readable
   part of the site's own documentation, not just a one-off Actions log
   entry. Be specific: name the repo, what you needed from it, and what
   page depends on it.
5. If you close a previously-reported gap in a run (e.g. you now have
   access that was previously missing), remove or check off that entry
   in `docs/reference/docs-sync.md`'s "Known gaps" section as part of the
   same PR.
6. Open a pull request with whatever fixes you made, including any
   `docs-sync.md` "Known gaps" edits. If you made no changes, do not open
   a PR.

## Sandbox constraints

**Do not run `npm`, `yarn` or `pnpm`, and do not build the site.** No
`npm install`, no `npm ci`, no `npm run build`. Nothing in the
instructions above asks for a build, and the sandbox cannot reach the
npm registry: on run 33194367605 the firewall proxy logged 83 requests
across four domains and `registry.npmjs.org` was not one of them, so an
install neither succeeds nor fails — it hangs. That run finished all of
its documentation work in the first six minutes, then spent thirteen
minutes inside a single `npm install` until the 20-minute step timeout
killed the job and threw the work away.

Verify what you changed by reading files instead. A broken internal link
is a path that does not exist under `docs/`, which `ls` answers in a
second.

## Notes for whoever reviews `missing-tool` reports or `docs-sync.md`'s
## Known gaps section

This is the intended trigger for widening this workflow's access
further, or for scheduling an agent (e.g. a heartbeat persona) to
implement a missing capability — read `docs/reference/docs-sync.md`
directly rather than digging through Actions run history; it should be
the current, durable record of what this system can and can't do yet.
