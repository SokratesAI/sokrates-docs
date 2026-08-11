---
id: repositoryfile-lockdown
title: Why seeded files get locked after creation
sidebar_position: 3
---

# Why seeded files get locked after creation

When [`GitHubService`](/reference/github-service) seeds a new repo, every
file it writes — `package.json`, `Dockerfile`, the CI workflow, and so on
— is represented by a `RepositoryFile` Crossplane resource. Those
resources don't just run once and disappear. Understanding why required
a real incident to surface, on this very docs site's own repo.

## The bug

`sokrates-docs` started from the standard Node/Express template, which
doesn't fit a static Docusaurus site. The first real change was deleting
the irrelevant files: `src/index.ts`, `src/index.test.ts`,
`vitest.config.ts`.

They came back. Twice. Committed straight to `main`, with their original
placeholder content, by Crossplane itself.

The reason: every `RepositoryFile` in the Composition is created with
`managementPolicies: [Observe, Create, LateInitialize]`, and nothing ever
turns that off. `Create` means exactly what it says — if the file is
observed missing, Crossplane creates it, for as long as the claim exists.
Deleting the file in git doesn't touch the claim, so nothing stops it.

## Two fixes that looked right and weren't

**Deleting the `RepositoryFile` claim itself** seemed like the obvious
next step. It didn't hold — the claim is owned by the parent
`GitHubService` composite resource, and Crossplane's normal reconcile
loop for that parent recreates any composed resource it expects but
doesn't find, the same way a `ReplicaSet` recreates a deleted `Pod`. The
claim came back, unpaused, and the file followed.

**Patching `managementPolicies` to `[Observe]`** (drop `Create`) looked
like the correct fix — it's the field that controls exactly this
behavior. It still wasn't durable: the policy is hardcoded directly in
the Composition's `base` for every `RepositoryFile`, not derived from a
patch, so Crossplane's reconciler kept re-asserting the original value.
Tested against six live claims: four reverted within seconds.

The only mechanism that actually stuck was the `crossplane.io/paused`
annotation — it stops the provider from reconciling that resource *at
all*, rather than trying to declare a different desired state that the
Composition immediately overwrites again.

## Why not just leave the automation running forever?

A repo is supposed to change — that's the whole point of committing to
it. A GitHub repo whose files get silently overwritten back to their
original template the moment someone deletes one isn't a starting point,
it's a trap. The fix isn't "prevent people from deleting files" — it's
"stop treating a one-time initial seed as a permanent desired state."

## Why not a read-only credential?

The obvious-sounding fix — give Crossplane's GitHub token read-only
access — doesn't work, because *creating* the repo, seeding the initial
files, and provisioning secrets are the same write capability that
causes the resurrection. Removing it stops the bug and the entire
ordering system in one move.

Branch protection on the repos doesn't cleanly solve it either.
Crossplane's provider authenticates as the same bot identity used for
this platform's own CI and PR merges — GitHub has no way to tell "the
automation seeding a brand new repo" apart from "the automation wrongly
resurrecting a deleted file," because it's the same actor either way.

## Why not a CronJob?

A polling job that periodically pauses any `RepositoryFile` that's
reached `Ready` works, and an early version of this fix shipped exactly
that. But Crossplane already has a primitive purpose-built for "run once
when something reaches a state," structurally separate from a
Composition's continuous reconcile loop: **Operations**
(`ops.crossplane.io/v1alpha1`). A `WatchOperation` reacting to
`RepositoryFile` changes does the identical job — check current state,
pause if `Ready` and not already paused — without a bespoke poll
interval, without its own RBAC and ServiceAccount, and using the
mechanism the platform (Crossplane) actually intends for this pattern
rather than working around it from outside.

An in-Composition alternative was considered too: patching
`managementPolicies` based on the file's own `Ready` status, routed
through the parent XR's status field. It was rejected — a naive version
isn't a one-way lock, it's a toggle. If the file's `Ready` condition ever
flips back to `False` (say, after a future deletion), the same logic
would flip `Create` back on, silently reopening the exact hole this
exists to close. A true one-way latch needs a stateful custom function to
remember "was this ever true," which is real complexity to get exactly
right for a marginal gain over the `WatchOperation`, whose "check current
state, act if needed" design needs no memory of past state at all.

## The net effect

Once a `RepositoryFile`'s content is confirmed present, Crossplane's
write access to it is durably revoked — not paused for a while, not
reverted on the next poll, permanently off until someone deliberately
turns it back on. The repo is yours from that point forward, the same as
any other repo.
