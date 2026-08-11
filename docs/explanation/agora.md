---
id: agora
title: How Agora runs an agent
sidebar_position: 2
---

# How Agora runs an agent

Agora is the platform's chat and agent host: a self-hosted web app where
you define *personas*, talk to them in *conversations*, and — the part
that makes it more than a chat client — schedule them to wake up and do
work on their own via *heartbeats*.

This page is about **why** those are three separate things, and what
actually happens between a schedule firing and a reply appearing. For the
field-by-field detail, see the [Persona](/reference/agora-persona) and
[Heartbeat](/reference/agora-heartbeat) reference pages.

## The three records, and why they are not one

It would be simpler to store a personality, a model and a schedule on one
"agent" object. Agora splits them because each of the three is reused
independently of the other two — one persona speaks in many conversations,
one conversation can hold several personas, and one persona can be woken
by several schedules.

A **persona** is *who*: a name, a personality prompt, a model, a set of
capability grants, and a `sharedMemory` scratchpad that survives across
every conversation the persona appears in. Personas are reusable — the
same persona can be a participant in several conversations at once, and
editing its personality changes it everywhere.

A **conversation** is *where*: an ordered list of messages plus its own
`memory` scratchpad, with one or more personas attached as participants.
One participant holds the `curator` role. A conversation can be forked
from any message, which is why it also carries a `rootId` — forks group by
lineage rather than by persona, so a conversation that changed personas
mid-thread still sorts with its own history.

A **heartbeat** is *when*: a schedule, a task, a list of vault paths, and
a binding to exactly one persona and one conversation. It holds no
personality and no model of its own. That binding is the whole point — a
heartbeat firing is not a special kind of event, it is an ordinary turn in
an ordinary conversation that nobody typed into. You can read the result
in the conversation afterwards exactly like any other message.

The cost of the split is that creating a working scheduled agent takes
three records instead of one. The benefit is that you can re-point a
schedule at a different persona, or give one persona five schedules, or
read a scheduled agent's entire history as a normal chat thread, without
any of those being special cases.

## What happens when a heartbeat fires

Nothing pushes. The runner polls.

`agora-persona-runner` evaluates each enabled heartbeat's `schedule`
against its own `lastRunAt` — idempotently, from that field alone, which
is what stops a restart mid-cycle from double-firing. When one is due, the
runner:

1. Fetches the contents of every path in `vaultPaths` **fresh, at trigger
   time** — not a snapshot from when the heartbeat was created. A trailing
   `/` means "everything under this folder". The fetched content is
   injected into that turn's context up to a 24,000-character cap, which
   the runner enforces rather than Agora.
2. Builds one turn for `personaId` in `conversationId`, with `task`
   layered in as the instruction for this particular firing.
3. Calls the provider named by the persona's `model` field.
4. Writes the reply into the conversation as a normal message, and writes
   a one-line status back onto the heartbeat's `lastResult` (`"replied 214
   chars"`, `"failed: ..."`) so the Studio list shows what happened without
   opening the thread.

"Run now" in the Studio does not bypass any of this. It sets `forceRun` on
the heartbeat; the runner performs the same turn on its next poll and
clears the flag.

## Two front doors, on purpose

Agora listens on two ports with two different Express apps, and the split
is a security boundary rather than a routing convenience.

- **Public app**, `PORT`, default `8080` — the Studio UI and everything a
  browser needs. It is what the Tailscale Ingress exposes.
- **Internal app**, `INTERNAL_PORT`, default `8081` — the agent surface,
  cluster-internal only, and guarded by a shared token supplied as the
  `x-agora-token` header. This is the port the runner uses.

The reason is that some writes should only ever come from inside the
cluster. When a persona holding the `manageAgora` capability creates
another persona, a conversation, a heartbeat or a workflow, the runner's
`create_*` tools call the **internal** app's create routes — never the
public ones. Agent-facing writes live on the internal app; that is
ADR 0007, and it is why the create routes are deliberately registered on
both apps rather than moved.

One consequence worth knowing before you deploy your own copy: if the
agent token environment variable is unset, the internal app **stays
open** rather than failing closed. The startup log says so explicitly. In
a cluster where only the public port is exposed that is a survivable
default, but it is a default, not a guarantee.

## Capabilities are read from the persona, never from the request

A persona's `capabilities` block is the list of things the runner will let
it actually do — search the web, read the vault, write to the vault, run
code, read the cluster, read GitHub, manage Agora objects, open PRs, merge
PRs, run a shell.

The important property is where that list is read from. The runner
enforces capabilities **server-side, from the stored persona record, on
every invocation** — never from anything in the invocation payload. A
caller cannot ask for a capability it was not granted, because the request
is not what the check consults.

The defaults are deliberately uneven rather than all-off or all-on:
`webSearch` and `vaultRead` default on, everything else defaults off. Read
access to the web and to the vault is what makes a persona useful at all;
writing, executing, and managing the platform are each a decision someone
has to make on purpose.

`githubWrite` and `githubMerge` are split for the same reason a human PR
review exists: a persona can be allowed to *propose* changes without being
allowed to merge its own. The distinction is real even though every agent
shares one GitHub account — which is also why the merge tool refuses on
anything but a fully green set of check-runs, rather than trying to work
out who opened the PR.

`terminalExec` is the one to think hardest about. It is an unrestricted
`bash -lc` in the runner pod, with no verb or flag allowlist of the kind
the kubectl and GitHub tools use. It therefore carries the union of that
pod's cluster RBAC and its GitHub token — the highest blast radius in the
list. It exists because the purpose-built tools have gaps, and a persona
that can only wait for a human to ship a fix is much less useful than one
that can go and fix it.

## Which model, and which ones cost money

A model is stored as a single `"<provider>:<model id>"` string, and the
provider prefix decides how the turn is billed and executed:

- `anthropic:` — the raw Messages API, **billed per token** against a
  prepaid balance.
- `claude-cli:` — the same underlying Claude models, reached through a
  persistent Claude Code CLI session in `agora-claude-bridge`, covered by
  a flat subscription rather than per-token billing.
- `gemini:` — the Gemini API, against a shared project key.

Every `anthropic:` entry has a `claude-cli:` twin, so choosing the
subscription path never costs you a model — only a provider prefix. This
is why the model catalog carries an explicit `metered` flag rather than
leaving people to infer it from a label: the metered entries have the
plainer names, and the free ones carry the technical `(CLI)` suffix, so
the labels point the wrong way from the billing.

The flag is left *undefined* on the Gemini entries rather than set to
false. That is not an oversight. Nobody has measured whether that key is
billed, and recording a guess of "free" is precisely the mistake the field
exists to prevent. The Studio only marks an entry as metered when it is
known to be.

Anything scheduled — a heartbeat, a workflow — is where metered billing
does real damage, because it spends with nobody watching. That is a policy
question rather than a code one, but the catalog is built so the policy is
possible to follow.

## Related

- [Persona reference](/reference/agora-persona) — every field and every
  capability.
- [Heartbeat reference](/reference/agora-heartbeat) — schedule grammar and
  fields.
- [Give an agent a recurring job](/tutorials/scheduled-agent) — the
  hands-on version of this page.
