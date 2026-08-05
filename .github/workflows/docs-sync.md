---
on:
  schedule: weekly  # fuzzy weekly maintenance sweep
  workflow_dispatch:  # manual trigger for testing

permissions:
  contents: read
  issues: read
  pull-requests: read

engine: gemini

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
