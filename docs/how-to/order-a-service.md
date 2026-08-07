---
id: order-a-service
title: How to order a new service
sidebar_position: 2
---

# How to order a new service

Goal: get a new source repo + config repo + working CI/CD pipeline for a
new service, without touching the GitHub UI or writing any deployment
YAML by hand.

## 1. Write the claim

Create a `GitHubService` claim — see the [reference page](/reference/github-service)
for the full field list. Minimal example:

```yaml
apiVersion: platform.sokratesai.io/v1alpha1
kind: GitHubService
metadata:
  name: my-new-service
  namespace: platform-catalog
spec:
  serviceName: my-new-service
  description: One-line description of what this service does.
```

Save it as a file in `platform-config/crossplane/service-my-new-service.yaml`
— follow the existing files in that directory (e.g.
`service-agora-claude-bridge.yaml`) for the comment conventions.

## 2. Open a PR to `platform-config`

```bash
cd platform-config
git checkout -b order-my-new-service
git add crossplane/service-my-new-service.yaml
git commit -m "Order my-new-service via Platform Product Catalog"
git push -u origin order-my-new-service
gh pr create
```

`platform-config`'s `main` is branch-protected — this PR needs a human
merge (from a phone or laptop), not an automated one.

## 3. Merge, then wait for Crossplane

Once merged, ArgoCD syncs the new `GitHubService` claim within a few
minutes. Crossplane then creates:

- The source repo (`my-new-service`)
- The paired config repo (`my-new-service-config`)
- Seeds both with the starter template (see the reference page for the
  full file list)

Check status:

```bash
kubectl get githubservices.platform.sokratesai.io my-new-service -n platform-catalog
```

Wait for `SYNCED` and `READY` to both show `True`.

## 4. Replace the starter skeleton with real code

The seeded files (`package.json`, `Dockerfile`, `src/index.ts`, etc.) are
a generic Node/Express starting point, not your actual service. Clone the
new source repo, replace what doesn't fit, commit normally via a PR — no
special process needed.

**Don't just delete files you don't need and stop there.** See
[why seeded files get locked after creation](/explanation/repositoryfile-lockdown)
— in short, deleting a seeded file in git alone isn't enough; the
`repositoryfile-lockdown` mechanism handles this automatically now (it
locks each file's Crossplane management shortly after the initial seed
succeeds), but it's worth understanding why that exists before you're
surprised by it.

## 5. Push to `main`

CI (`.github/workflows/build.yaml`, already seeded) runs on every push to
`main`: tests, builds and pushes a Docker image, then commits the real
image digest to the config repo. ArgoCD picks that up automatically —
no `platform-config` PR, no manual deploy step.

## Troubleshooting

- **Pod stuck `ImagePullBackOff` on the placeholder digest
  (`sha256:0000...`)**: the first CI run on `main` hasn't completed yet,
  or ArgoCD hasn't synced the config repo's updated `manifest.yaml`. Force
  a sync: `kubectl annotate application <name>-config -n argocd
  argocd.argoproj.io/refresh=hard --overwrite`.
- **A seeded file you deleted keeps coming back**: check whether its
  `RepositoryFile` claim in `platform-catalog` has actually reached
  `Ready` and been paused yet (`kubectl get repositoryfiles.repo.github.m.upbound.io
  -n platform-catalog -o custom-columns='NAME:.metadata.name,PAUSED:.metadata.annotations.crossplane\.io/paused'`)
  — this needs a few minutes after initial creation. See the explanation
  page linked above for the full mechanism.
