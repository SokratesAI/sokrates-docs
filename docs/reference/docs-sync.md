---
id: docs-sync
title: docs-sync (the self-documenting mechanism)
sidebar_position: 3
---

# `docs-sync`

This page documents the system that keeps this site's own `docs/reference/`
section current — what it actually is, what it can do today, and what it
still can't. Written so a future agent (human or AI) can read this one
page and know exactly what's already automated and what's still a gap,
without digging through GitHub Actions run history.

## What it is

A [gh-aw](https://github.com/github/gh-aw) (GitHub Agentic Workflows)
workflow — `.github/workflows/docs-sync.md`, compiled to
`docs-sync.lock.yml` — running on Google's **Gemini** API (`engine:
gemini`, model `gemini-flash-latest`, free tier).

- **Trigger**: weekly (fuzzy schedule) + manual (`workflow_dispatch`).
- **Scope**: only edits `docs/reference/`. Tutorials, how-to guides, and
  explanation content are deliberately out of scope — those need human
  judgment about what's worth teaching, not just fact-checking against a
  source.
- **Output mechanism**: [safe outputs](https://github.github.com/gh-aw/) —
  it can never push directly to `main`. It either opens a pull request
  (`create-pull-request`, max 1 per run) with changes it made, or calls
  `missing-tool` to report a gap it can't close itself, or does nothing
  (`noop`) if the reference section is already accurate.

## What it can read

As of 2026-08-07, `docs-sync` has short-lived, read-only access (via a
scoped `sokrates-ci-deployer` GitHub App installation token, generated
fresh on every run — not a static secret) to:

| Repo | Why |
|---|---|
| `sokratesai/platform-config` | Verify CRD/Composition claims (e.g. `github-service.md`) against the live `crossplane/*.yaml` source. |
| `sokratesai/sokrates-cli` | Verify any documented CLI commands against real source. |
| `sokratesai/operator` | Verify any documented API surface against real source. |
| `sokratesai/sokrates-docs` | Its own repo (redundant with the checkout it already has, included for GitHub API consistency). |

It cannot read any other repo. This list is deliberately narrow —
widened only when a real `missing-tool` report justified it (see below),
not granted broadly up front.

## Known gaps

*Agent-maintained. Update this list as part of any `docs-sync` PR that
reports a `missing-tool`, and remove/check off entries once the
underlying access or capability is added.*

- None open as of 2026-08-07 — the original gap (no read access to
  `platform-config`/`sokrates-cli`/`operator`, first reported in run
  [31179199461](https://github.com/SokratesAI/sokrates-docs/actions/runs/31179199461))
  was closed the same day.

## What it doesn't do yet

- **Doesn't trigger on changes in the repos it documents.** It only runs
  on its own schedule or manual dispatch — a change merged to
  `platform-config` today won't be reflected here until the next weekly
  sweep (or someone runs it manually). A diff-aware, dispatch-triggered
  version (fires when a documented source repo's `main` changes, looks at
  that specific diff) is planned but not built.
- **Doesn't write tutorials, how-to guides, or explanations.** By design
  — those need a human's judgment about what's worth teaching.
- **Doesn't implement missing capabilities itself.** If it reports a
  `missing-tool` or logs an entry here, closing that gap (granting
  access, building a new mechanism) is still a human or a separately
  scheduled agent's job — this workflow only ever proposes reference-doc
  *content* changes, never changes to its own permissions or workflow
  definition.
