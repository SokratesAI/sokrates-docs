---
# TEMPORARY evaluation workflow, not part of the real docs pipeline. Manual
# trigger only, opens a draft PR (never mergeable, never touches main) so
# output quality can be compared across models before docs-sync's real
# model choice is finalized. Delete after the comparison is done -- see
# vault Projects/Sokrates/Projects/Sokrates-Docs/_context.md.
on:
  workflow_dispatch:

permissions:
  contents: read

engine: gemini
model: gemini-3.5-flash-lite

pre-agent-steps:
  - uses: actions/create-github-app-token@v1
    id: eval-read-token
    with:
      app-id: ${{ secrets.ORG_APP_ID }}
      private-key: ${{ secrets.ORG_APP_PRIVATE_KEY }}
      owner: SokratesAI
      repositories: agora,sokrates-docs

tools:
  github:
    github-token: ${{ steps.eval-read-token.outputs.token }}
    allowed-repos:
      - sokratesai/agora
      - sokratesai/sokrates-docs
    min-integrity: merged
    toolsets: [default]

network: defaults

safe-outputs:
  create-pull-request:
    title-prefix: "[eval:gemini-3.5-flash-lite] "
    labels: [documentation, eval, do-not-merge]
    max: 1
---

# docs-eval-flash35lite

Evaluation run. Read the real `SokratesAI/agora` repo (a production PWA —
`package.json`, `src/`, `tests/`, `public/`, `Dockerfile`, `tsconfig.json`,
no README) via the GitHub tool, and draft a new reference documentation
page at `docs/reference/agora.md`.

Follow the style and density of the existing `docs/reference/github-service.md`
as a model: an accurate "what it is" summary, key architecture facts you
can actually verify from the repo's real contents (not guessed), and any
genuinely useful structural detail (main dependencies, how it's built/run,
notable directories). Base every claim on what you actually read in the
repo — do not fabricate or generalize from the name alone.

This is an evaluation of output quality, not a final polished page. Open
the PR regardless of how complete you're able to make it, so the attempt
itself is visible for comparison. Do not edit any other files.
