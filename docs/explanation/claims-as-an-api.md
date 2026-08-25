---
id: claims-as-an-api
title: Ordering infrastructure over HTTP — the claim is the ticket
sidebar_position: 4
---

# Ordering infrastructure over HTTP — the claim is the ticket

The goal this page explains: **send a simple HTTP request, get infrastructure back.**
You POST an order, you get `200 OK` and a ticket id, and something behind that ticket
builds your resources while you poll for status. Any UI, TUI or CLI can then be
written against that one API.

The hard part is usually assumed to be the middle: an API that generates manifests,
which get committed to git, which GitOps then picks up and applies. That chain is
genuinely hard to build and harder to keep user-friendly.

**The point of this page is that the middle mostly does not need to exist.** A
Crossplane composite resource already *is* the ticket, and the platform is already
running the version of Crossplane where that works against ordinary Kubernetes
objects.

## The order and the ticket are the same object

Applying a composite resource is the order. The object that results from applying it
is the ticket. There is no second record to invent.

Here is one written against a definition that is live on this platform — a
`TailscaleExposure`, four fields, which puts an existing in-cluster Service on the
tailnet. The definition and its Composition were installed on 2026-08-25; **no
instance of one has been created yet**, so this is the first one you would write
rather than a reading off something already running:

```yaml
apiVersion: platform.sokratesai.io/v1alpha1
kind: TailscaleExposure
metadata:
  name: expose-nova
  namespace: agents
spec:
  hostname: nova              # becomes nova.tailc83eb3.ts.net
  serviceName: nova-site
  port: 8083
  targetPodLabels:
    app: nova-site
```

The API server admits that immediately — schema validation, then it exists. That
admission *is* your `200 OK`. The ticket id is the object's own name and UID; you did
not have to mint one.

Then the status you poll is the object's `status.conditions`, which Crossplane writes
and keeps writing. Here it is off a composite resource that really is running — the
`GitHubService` behind this documentation site, ordered 19 days ago:

```bash
kubectl get githubservice sokrates-docs -n platform-catalog \
  -o jsonpath='{range .status.conditions[*]}{.type}={.status} {.reason}{"\n"}{end}'
```

```
Synced=True ReconcileSuccess
Ready=True Available
Responsive=True WatchCircuitClosed
```

`Synced` says Crossplane understood the order. `Ready` says the thing you ordered
exists and works. `Responsive` says the controller is still watching rather than
having backed off. A failure lands in the same place, with a `message` — so there is
one status surface for "accepted", "in progress", "done" and "broken", instead of a
job-status endpoint you have to design and then keep truthful.

You can watch the same three live objects the platform runs on:

```bash
kubectl get githubservices -A
```

```
NAMESPACE          NAME                   SYNCED   READY   COMPOSITION           AGE
platform-catalog   agora-claude-bridge    True     True    githubservice-basic   24d
platform-catalog   agora-persona-runner   True     True    githubservice-basic   26d
platform-catalog   sokrates-docs          True     True    githubservice-basic   19d
```

Every one of those was an order for a repo, a paired config repo and a working
CI/CD pipeline. They are still sitting there as tickets, still reporting, weeks later.

## The API contract is the XRD, not a service you write

The schema that defines what a valid order looks like is the
`CompositeResourceDefinition` (XRD). It is an OpenAPI v3 schema, so it is a real API
contract — required fields, regex patterns, ranges, and a `description` per field
that a form or a TUI can render as help text.

From the live `TailscaleExposure` XRD, on the `hostname` field:

> The name this appears at on the tailnet — `nova` becomes nova.tailc83eb3.ts.net.
> Deliberately required and deliberately NOT defaulted from the claim's own name: the
> tailnet is a flat global namespace shared with every other machine on it, so a
> hostname collision silently steals traffic from something else. Making it explicit
> means nobody ever orders one by accident.

That means the "API layer" you still have to build is genuinely thin. It does two
things:

1. Take a small JSON body, template it into the composite resource, apply it.
2. Read `status.conditions` back on request.

Both are one Kubernetes API call each. Nobody writing a UI against that shim needs to
know Kubernetes exists — they need the field list, and the field list is published by
the XRD itself, so the shim can even generate its own form.

An HTTP shim, in full, is about this size:

```python
# POST /orders/tailscale-exposure  ->  201 {"ticket": "expose-nova"}
def order(body):
    api.create_namespaced_custom_object(
        group="platform.sokratesai.io", version="v1alpha1",
        namespace=body["namespace"], plural="tailscaleexposures",
        body={
            "apiVersion": "platform.sokratesai.io/v1alpha1",
            "kind": "TailscaleExposure",
            "metadata": {"name": body["name"]},
            "spec": body["spec"],
        },
    )
    return {"ticket": body["name"]}, 201

# GET /orders/tailscale-exposure/expose-nova  ->  200 {"ready": true, ...}
def status(name, namespace):
    xr = api.get_namespaced_custom_object(..., name=name)
    conds = {c["type"]: c for c in xr.get("status", {}).get("conditions", [])}
    return {
        "ready": conds.get("Ready", {}).get("status") == "True",
        "message": conds.get("Synced", {}).get("message"),
    }
```

There is no manifest generation in there, and no git.

## What "Crossplane v1 vs v2" actually changes

This is the part that is easy to get wrong, because the v1 way of working leaves
traces in a cluster long after the version has moved on.

**In v1**, Crossplane composed *managed resources* — objects belonging to a provider
it had installed. To make it manage a plain Kubernetes object (an Ingress, a
ConfigMap, a NetworkPolicy), you needed `provider-kubernetes` installed and had to
wrap each object in an `Object` resource. That is a real adapter, and on a single-node
cluster it can be more machinery than the thing it manages. The workaround this
platform took is visible in its own oldest Composition: `githubservice-basic` has
Crossplane write the new service's Deployment, Service and Ingress into a `-config`
repo *as templated YAML text*, and lets ArgoCD create the real objects from those
files later. Crossplane's job ends when the file is written.

That has a specific cost, and it is not "an extra hop". It is that **no controller
compares the file with the live object in either direction** — the XR cannot see what
the cluster did with its text, and editing the live object never reaches the XR.

How much that costs depends on your GitOps setup, and here it is less than it sounds:
all 12 ArgoCD Applications in this cluster run with `selfHeal: true` and `prune: true`,
so ArgoCD does revert hand-edits to everything it manages. **The gap is not drift on
managed objects; it is objects nothing was ever told to manage.** Of the ten Tailscale
Ingresses live here, two — `headlamp/headlamp-tailscale` and `obsidian/couchdb-tailscale`
— carry no `argocd.argoproj.io/tracking-id` at all, so no Application owns them.
ArgoCD cannot reconcile what it does not know exists, and that is the case a composite
resource answers and a git file cannot.

**In v2**, a composite resource can compose ordinary Kubernetes objects directly, with
no provider adapter, and it reconciles them forever. Edit the live Ingress by hand and
Crossplane puts it back, because the Ingress is a composed resource of an XR whose job
is to keep reality matching the spec. v2 also makes XRs *namespaced* and drops the
separate "claim" object: the namespaced XR you apply is the thing, so there is one
object rather than a claim/XR pair.

**This platform runs v2 today.** Measured 2026-08-25:

```bash
kubectl get deploy crossplane -n crossplane-system \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
# xpkg.crossplane.io/crossplane/crossplane:v2.3.3

kubectl get xrd -o custom-columns='NAME:.metadata.name,SCOPE:.spec.scope,CLAIM:.spec.claimNames.kind'
# NAME                                        SCOPE        CLAIM
# githubrepopolicies.platform.sokratesai.io   Namespaced   <none>
# githubservices.platform.sokratesai.io       Namespaced   <none>
# tailscaleexposures.platform.sokratesai.io   Namespaced   <none>
```

All three XRDs are `apiextensions.crossplane.io/v2`, `scope: Namespaced`, with no
`claimNames` — the v2 model. And `tailscaleexposure-ingress` is a Composition that
composes a `networking.k8s.io/v1` `Ingress` and a `NetworkPolicy` directly, through
`function-patch-and-transform`, and no `provider-kubernetes` pod is running in
`crossplane-system` — the only provider there is `provider-upjet-github`.

So the "adapter-free hands" are not a future upgrade to argue about. They are what
`TailscaleExposure` was built on, and it is the worked example for anything ordered
next.

### The word "claim" in this documentation

You will still see "claim" throughout these docs, including on the
[how-to for ordering a service](/how-to/order-a-service). Under v2 it means *the
namespaced composite resource you apply* — the order — rather than v1's separate
`Claim` kind. There is no `Claim` object in this cluster. The word survived because it
describes the role well: you claim a capability, the platform satisfies it.

## Where GitOps still belongs — and where it does not

Both can be true at once, and keeping them straight is what makes the design simple
instead of tangled.

**GitOps owns how the order gets written.** The `GitHubService` files live in
`platform-config/crossplane/`, reviewed in a PR and merged by a human, and ArgoCD
applies them. That gives an audit trail, review, and a way to recreate the whole
platform from an empty cluster. Worth keeping.

**GitOps does not belong in the ordering-and-status loop.** Once the composite
resource exists, everything the API needs — did it work, is it ready, what broke —
comes off the live object. Putting a git commit and a sync interval in the middle of
that loop buys nothing and costs latency plus a class of failure ("the file is right
but the cluster isn't") that has no owner.

The practical rule:

| | Path |
|---|---|
| Long-lived platform infrastructure, reviewed | git → ArgoCD → XR → composed objects |
| Self-service ordering from a UI or API | HTTP shim → XR → composed objects |

Same XR, same Composition, same status surface. Only how the XR gets created differs,
and neither path needs to know about the other.

## What this does not give you

Being clear about the edges is what stops this pattern being oversold:

- **Composition is not general-purpose code.** It is patch-and-transform or a
  composition function. A field a Composition needs must be *on the XR*, because a
  Composition cannot read a value off another live object. That is why
  `TailscaleExposure` requires `targetPodLabels` even though the Service already
  carries the same selector — stated in the XRD itself, as a deliberate choice.
- **Namespaced scope is a real boundary.** A v2 namespaced XR composes into its own
  namespace. Cluster-scoped work needs a cluster-scoped XR and the RBAC to match.
- **`Ready: True` means the objects exist and reconcile, not that your app works.**
  `TailscaleExposure` will happily expose a Service with no pods behind it; the
  Ingress resolves and answers 503. That is a Kubernetes-level symptom, not a
  Crossplane one, and the status surface will not flag it.
- **The XRD is a published API, so changing it breaks callers.** Adding a required
  field to a `v1alpha1` in use is a breaking change to every shim and UI in front of
  it. Version the XRD rather than editing in place once anything real depends on it.

## See also

- [How to order a new service](/how-to/order-a-service) — the git path, end to end.
- [GitHubService reference](/reference/github-service) — the full field list of the
  largest composite resource on the platform.
- [Why seeded files get locked after creation](/explanation/repositoryfile-lockdown) —
  what happens when a composed resource and a human both want to own the same file.
