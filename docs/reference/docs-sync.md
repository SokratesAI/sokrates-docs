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

## Which model it runs on, and why that is a quota question

`docs-sync` stays on `gemini-flash-latest` (decided 2026-08-11). A model
comparison had been left open between keeping this model, retrying the
cheaper `gemini-3.5-flash-lite` on a narrower task, or provisioning a
dedicated Gemini API key. That framing turned out to be the wrong axis:
**the constraint is not which model is capable enough, it is that one API
key backs both this weekly batch job and live interactive traffic.**

Two observations behind that, **neither of which is checkable from inside
this repo** — both come from the Agora platform next door, and are
recorded here because this page is where the consequence lives:

- Measured against the live Agora persona list on 2026-08-11: three
  personas run against the same `GEMINI_API_KEY` this workflow uses —
  `Agora` and `Learning-Agent` on `gemini-3.6-flash`, and `Gemini` on
  `gemini-3.5-flash-lite`.
- From the eval runs described in this project's handover report
  (`Sokrates-Docs/Architecture.md` §6.5, vault): a single evaluation run
  of this workflow's task did roughly 277K tokens across 16 tool calls
  before exhausting that key's daily quota.

Together: a sweep here can starve a persona a person is talking to.

That rules out the cheaper-model option on its own terms: `gemini-3.5-flash-lite`
is itself a live persona's model, so moving to it does not buy quota
isolation — it only changes which user-facing persona gets starved first.
Capability was never the deciding factor.

One thing deliberately **not** claimed here: `gemini-flash-latest` is a
rolling alias, and the Generative Language API does not expose what it
resolves to (`GET /v1beta/models/gemini-flash-latest` reports version
`Gemini Flash Latest`, not an underlying build). Whether it draws on the
same per-model bucket as `gemini-3.6-flash` is unknown, and the decision
above does not depend on it — the key is shared either way.

The real fix is a dedicated Gemini API key for docs automation, separate
from the platform's. Until that exists, this workflow stays weekly and
stays on the shared key, and the dispatch-on-merge mechanism below stays
unbuilt.

## Known gaps

*Agent-maintained. Update this list as part of any `docs-sync` PR that
reports a `missing-tool`, and remove/check off entries once the
underlying access or capability is added.*

- **No dedicated API quota** (open, 2026-08-11). This workflow's Gemini
  key is shared with live Agora persona traffic, so a sweep here can
  exhaust the quota of a service someone is actively using — see "Which
  model it runs on" above. Not a `missing-tool` gap: nothing is
  inaccessible, the capacity is contended. Closing it means provisioning
  a Gemini key dedicated to docs automation, which is a human action, not
  something this workflow can propose. It is what currently blocks
  dispatch-on-merge.
- No access gaps open as of 2026-08-07 — the original one (no read access
  to `platform-config`/`sokrates-cli`/`operator`, first reported in run
  [31179199461](https://github.com/SokratesAI/sokrates-docs/actions/runs/31179199461))
  was closed the same day.

## What it doesn't do yet

- **Doesn't trigger on changes in the repos it documents.** It only runs
  on its own schedule or manual dispatch — a change merged to
  `platform-config` today won't be reflected here until the next weekly
  sweep (or someone runs it manually). A diff-aware, dispatch-triggered
  version (fires when a documented source repo's `main` changes, looks at
  that specific diff) is designed but not built, and is deliberately
  blocked on the quota question above: it would turn Gemini calls from
  weekly into one per merge across every documented repo, on a key that
  live personas already share.
- **Doesn't write tutorials, how-to guides, or explanations.** By design
  — those need a human's judgment about what's worth teaching.
- **Doesn't implement missing capabilities itself.** If it reports a
  `missing-tool` or logs an entry here, closing that gap (granting
  access, building a new mechanism) is still a human or a separately
  scheduled agent's job — this workflow only ever proposes reference-doc
  *content* changes, never changes to its own permissions or workflow
  definition.
