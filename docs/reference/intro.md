---
id: intro
title: Reference
sidebar_position: 1
---

# Reference

Accurate, information-dense technical descriptions — CRDs, CLI commands,
config schemas, service APIs. Free of opinion or narrative; see
[Diátaxis: Reference](https://diataxis.fr/reference/).

This section is kept current automatically by the `docs-sync` gh-aw
workflow (Gemini engine) — see `.github/workflows/docs-sync.md`. It proposes
a PR when it detects reference content has drifted from the code it
describes; a human still merges.

- **[`GitHubService`](/reference/github-service)** — the Platform Product
  Catalog's service-ordering CRD.
- **[Agora Persona](/reference/agora-persona)** — fields, capability
  grants, model identifiers and routes.
- **[Agora Heartbeat](/reference/agora-heartbeat)** — schedule grammar,
  fields and firing behaviour.
- **[`docs-sync`](/reference/docs-sync)** — the workflow that keeps this
  section current, and its known gaps.
