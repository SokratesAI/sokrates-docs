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
# 2026-08-07: the specific pin used here (gemini-3-flash) turned out not
# to exist at all -- checked the real model list via the API's own
# ListModels endpoint (https://generativelanguage.googleapis.com/v1beta/models)
# rather than guessing again; only `gemini-3-flash-preview` existed under
# that name, and the stable lineup had already moved past it
# (gemini-3.5-flash, gemini-3.6-flash). Given this workflow's whole point
# is low-maintenance self-updating docs, chasing Google's release cadence
# with a fresh hardcoded pin every time one goes stale defeats the
# purpose -- use the rolling "latest" alias instead, which stays on the
# free Flash tier by construction (Pro models require billing; Flash
# doesn't) without needing to be updated again.
model: gemini-flash-latest

tools:
  github:
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
2. Check for internal consistency problems you can fix confidently:
   - Broken internal links (links to `docs/` pages that don't exist).
   - Pages whose content contradicts another reference page.
   - Placeholder/stub pages (e.g. "No reference pages yet") that are
     stale relative to what the rest of the site now documents elsewhere
     (for example if a how-to guide references a CLI command or CRD field
     that has no corresponding reference page yet).
3. If you find something you can fix directly (broken link, clear
   contradiction, obviously missing but well-defined stub), make the edit.
4. If checking a claim properly would require reading the actual source of
   truth outside this repo — e.g. the CRD schemas in
   `SokratesAI/platform-config` (`crossplane/*.yaml`), the CLI command
   definitions in `SokratesAI/sokrates-cli`, or the API surface in
   `SokratesAI/operator` — do NOT guess or fabricate reference content.
   Use the `missing-tool` safe output to report that you'd need read
   access to that repo to verify/update the relevant page, and say
   specifically which page and which repo.
5. Open a pull request with whatever fixes you made. If you made no
   changes, do not open a PR.

## Notes for whoever reviews the `missing-tool` reports

The recurring "I need read access to X" reports from this workflow are the
signal for when it's worth widening this workflow's GitHub App token scope
(the `ORG_APP_ID`/`ORG_APP_PRIVATE_KEY` secrets already provisioned on this
repo by the Platform Product Catalog composition) to include specific
source repos — deliberately not granted broad org-wide read access
up front.
