---
on:
  schedule: weekly  # fuzzy weekly maintenance sweep
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
# so it cannot fit inside 20 requests on any key. A second API key would
# not fix this: the limit is per-key AND per-model, and 2 x 20 is still
# short of 31.
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
# If this exhausts too, the free tier on this project genuinely cannot run
# docs-sync and the fix is a credential, not a model -- Edvard has already
# minted a Groq key for exactly this. gh-aw v0.84.3 has no Groq engine, so
# that path means either a newer gh-aw or a custom engine.
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

## Notes for whoever reviews `missing-tool` reports or `docs-sync.md`'s
## Known gaps section

This is the intended trigger for widening this workflow's access
further, or for scheduling an agent (e.g. a heartbeat persona) to
implement a missing capability — read `docs/reference/docs-sync.md`
directly rather than digging through Actions run history; it should be
the current, durable record of what this system can and can't do yet.
