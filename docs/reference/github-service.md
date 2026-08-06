---
id: github-service
title: GitHubService (Platform Product Catalog)
sidebar_position: 2
---

# `GitHubService`

The self-service ordering API for the **Platform Product Catalog**. A
single `GitHubService` claim provisions a fully-templated GitHub source
repo, a paired `<name>-config` repo, and the Actions secrets both need —
no manual GitHub UI steps.

- **Group / Version**: `platform.sokratesai.io/v1alpha1`
- **Kind**: `GitHubService`
- **Scope**: Namespaced (create claims in the `platform-catalog` namespace)
- **Composition**: `githubservice-basic`

## Spec fields

| Field | Type | Default | Required | Description |
|---|---|---|---|---|
| `serviceName` | string | — | yes | Name of the GitHub repo to create. Also used as the K8s resource name, so it must be a valid lowercase RFC 1123 name (`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`). |
| `description` | string | — | no | Repo description, set on the source GitHub repo. |
| `allowDeletion` | boolean | `false` | no | If `false`, the underlying GitHub repos are **orphaned, not deleted**, when this claim is deleted — protects against accidental repo deletion. Set `true` to allow real deletion. |
| `publicPort` | integer | `8080` | no | Port exposed via the Tailscale Ingress on the deployed service. |
| `internalPort` | integer | `8081` | no | Cluster-internal-only port (not exposed via Ingress). |
| `metricsPort` | integer | `9464` | no | Prometheus-scrape-only port. |
| `persistenceSize` | string | `1Gi` | no | Size of the PVC mounted at `/data` in the deployed pod. |

## Example

```yaml
apiVersion: platform.sokratesai.io/v1alpha1
kind: GitHubService
metadata:
  name: my-new-service
  namespace: platform-catalog
spec:
  serviceName: my-new-service
  description: >-
    One-line description of what this service does.
```

## What gets created

Applying a `GitHubService` claim produces, via the `githubservice-basic`
Composition:

- **Source repo** (`<serviceName>`) — private, seeded with a Node 20 +
  Express starter (`package.json`, `tsconfig.json`, `vitest.config.ts`,
  `.gitignore`, `src/index.ts`, `src/index.test.ts`, `Dockerfile`,
  `.github/workflows/build.yaml`), plus repo-scoped `ORG_APP_ID` /
  `ORG_APP_PRIVATE_KEY` Actions secrets (a GitHub App installation token,
  scoped to that repo's own `-config` repo only).
- **Config repo** (`<serviceName>-config`) — private, seeded with a
  `manifest.yaml` (PVC, Deployment, Service, Tailscale Ingress, and two
  NetworkPolicies — one for Tailscale ingress traffic, one for Prometheus
  scraping). Auto-discovered and deployed by ArgoCD's
  `platform-config-repos` `ApplicationSet` (any repo matching
  `-config$`).
- **CI pipeline** in the source repo: on push to `main`, runs tests,
  builds and pushes a Docker image to `ghcr.io/sokratesai/<serviceName>`,
  then commits the real image digest to the config repo's
  `manifest.yaml` — which ArgoCD picks up and deploys automatically. No
  `platform-config` PR, no manual step.

The starter files are identical across every service on purpose — the CI
workflow reads the service name from GitHub's own
`${{ github.event.repository.name }}` context at runtime, so nothing
needs to be templated per service except `manifest.yaml`.

## Lifecycle after creation

Every seeded file is a `RepositoryFile` resource with
`managementPolicies: [Observe, Create, LateInitialize]` — Crossplane
seeds it once, and a `repositoryfile-lockdown` `WatchOperation` pauses
each claim (`crossplane.io/paused: "true"`) once it's confirmed `Ready`,
permanently revoking Crossplane's write access to that file. After that
point the file is yours: edit it, delete it, replace it entirely via a
normal PR, and Crossplane will never touch it again. See
[Why seeded files get locked after creation](/explanation/repositoryfile-lockdown)
for why this exists and what it replaced.

## Known limitations

- Deleting a `GitHubService` claim with `allowDeletion: true` **permanently
  deletes** both real GitHub repos — not reversible.
- The starter template is currently fixed (one Node/Express shape) —
  there's no `spec.template` selector for different service types yet.
- The ordering-side credential (Crossplane's `ClusterProviderConfig`)
  still uses a broadly-scoped bot token, not a narrowly-scoped one.
