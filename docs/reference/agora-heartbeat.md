---
id: agora-heartbeat
title: Agora Heartbeat
sidebar_position: 4
---

# Heartbeat

A trigger config bound to exactly one persona and one conversation. When
its schedule comes due, `agora-persona-runner` performs one turn as that
persona, in that conversation, with the heartbeat's `task` and freshly
fetched vault content layered into the context.

A heartbeat holds no personality and no model of its own — those come from
the persona it names.

- **Stored as**: one JSON file per record, under `heartbeats/` in Agora's
  data volume.
- **Created via**: Studio → **Heartbeats** → **New heartbeat**, or
  `POST /heartbeats`.

## Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | generated | UUID. |
| `name` | string | — | **Required**, non-empty. |
| `personaId` | string | — | **Required.** Must resolve to an existing persona. Still required in workflow mode, where the runner does not use it. |
| `conversationId` | string | — | **Required** unless `newConversationName` is supplied on create. Must resolve to an existing conversation. |
| `schedule` | string | — | **Required.** See [Schedule grammar](#schedule-grammar). |
| `task` | string | `""` | The instruction for this firing — what the persona is being woken up to do. |
| `workflowId` | string \| null | `null` | When set, firing runs that Workflow's steps instead of a single curator turn. Participants then come from the bound conversation's own persona list. |
| `vaultPaths` | string[] | `[]` | Vault document paths. A trailing `/` means "everything under this folder". Fetched **fresh at trigger time**, then injected up to `VAULT_CONTEXT_CAP` — 24,000 characters of vault content per heartbeat, enforced by the runner (`agora_runner/config.py`), not by Agora. |
| `enabled` | boolean | `true` | Disabled heartbeats are never evaluated. |
| `forceRun` | boolean | `false` | What "Run now" sets. The runner performs the turn on its next poll and clears the flag. |
| `lastRunAt` | string \| null | `null` | ISO 8601. The runner evaluates the schedule from this field alone. |
| `lastResult` | string \| null | `null` | One status line written back by the runner — `"replied 214 chars"`, `"failed: ..."` — shown in the Studio list. |
| `rotateConversationEachRun` | boolean | unset (off) | Workflow mode only. Creates a fresh conversation each cycle, carries the persona list forward, re-points the heartbeat, and archives older cycle-conversations. Keeps a verbose per-cycle transcript bounded. |
| `conversationRetention` | number | `5` | How many rotated conversations stay active; older ones are **archived, not deleted**. Only meaningful with `rotateConversationEachRun`. |
| `createdAt` | string | generated | ISO 8601. |

`newConversationName` is a **create-only** input, not a stored field. Pass
it instead of `conversationId` and the route creates an empty conversation
for this heartbeat, with the named persona attached.

## Schedule grammar

Validated by `isValidSchedule` at the route. All times are **Europe/Oslo**.

| Form | Meaning | Example |
|---|---|---|
| `daily@HH:MM` | Once a day at that local time. | `daily@07:30` |
| `every@N[m\|h]` | Every N minutes or hours, measured from `lastRunAt`. | `every@90m`, `every@6h` |
| `every@N[m\|h]@HH:MM` | Anchored interval — slots laid out from that time of day. | `every@6h@12:00` → 12:00, 18:00, 00:00, 06:00 |
| `cron@<m> <h> <dom> <mon> <dow>` | Five-field cron expression. | `cron@0 9 * * 1-5` |

### The anchored-interval restriction

An **anchored** interval must divide 24 hours evenly. `every@7h@12:00` is
rejected; `every@7h` — unanchored — is fine.

The reason is a real off-by-one at midnight rather than tidiness. Each day
lays its slots out from the anchor, so with an interval that does not
divide 24h the two sides of midnight disagree: `every@7h@12:00` gives
05:00 / 12:00 / 19:00, but at 00:30 the previous slot computes as 22:00
the night before — a time that did not exist when evaluated at 23:30. It
would fire one extra time every midnight. Rejecting the input is what lets
the runner's `last_anchored_occurrence` stay three lines long.

### Cron fields

Each of the five fields accepts `*`, `N`, `a-b`, any of those with a
`/step` suffix, and comma-separated combinations.

| Position | Field | Range |
|---|---|---|
| 1 | minute | 0–59 |
| 2 | hour | 0–23 |
| 3 | day of month | 1–31 |
| 4 | month | 1–12 |
| 5 | day of week | 0–7 (0 and 7 both mean Sunday) |

A step needs a range to step through: `*/15` and `0-30/5` are valid,
a bare `5/15` is not. Steps must be integers ≥ 1.

The Agora-side check is a *validator*, not a parser — it answers yes/no
and never expands a range. It is a second implementation of the runner's
`parse_cron_field` and is deliberately no looser than it, since anything
accepted here reaches a runner that then has to make sense of it.

Note that matching the schedule regex does **not** imply a schedule is
valid — the cron fields are checked separately. `isValidSchedule` is the
only complete answer, and it is what both create and update routes call.

## Firing

The runner polls; nothing pushes. For each enabled heartbeat it evaluates
`schedule` against `lastRunAt` **idempotently, from that field alone** —
which is what stops a restart mid-cycle from double-firing.

On a due heartbeat it fetches `vaultPaths` fresh, builds one turn for
`personaId` in `conversationId` with `task` layered in, calls the
persona's model, writes the reply into the conversation as a normal
message, and writes `lastResult` back.

Heartbeat turns always run **non-sticky** with respect to model fallback,
regardless of the conversation's `stickyFallback` setting. That is
enforced by the runner. A scheduled proactive message should not
permanently downgrade the model of a persona that other conversations also
use.

## Routes

| Method | Path | Apps | Notes |
|---|---|---|---|
| `POST` | `/heartbeats` | both | Create. Returns `201 {"status":"created","heartbeat":{...}}`. |
| `GET` | `/heartbeats` | both | List, sorted by name. |
| `PATCH` | `/heartbeats/:id` | both | Partial update. Re-validates `schedule` if present. |
| `DELETE` | `/heartbeats/:id` | public | Delete. |
| `POST` | `/heartbeats/:id/run` | public | "Run now" — sets `forceRun`. `404` if the heartbeat does not exist. |

"both" means the route exists on the public app (8080) and the internal,
token-guarded agent surface (8081). See
[How Agora runs an agent](/explanation/agora) for why that split exists.

### "Run now" while a run is in flight

`POST /heartbeats/:id/run` answers `200` with a `status` of either
`queued` or `already-running`, plus `runningSince` when it is the latter.
The runner claims a cycle by writing `lastResult: "running"` the moment it
starts and overwrites it on every terminal path, so that field is the
honest "is a cycle in flight" signal — and the route reads it *before*
setting `forceRun`.

Pressing "Run now" during a run does **not** start a second one. The
runner's poll loop is single-threaded and the deployment is `Recreate`
with one replica, so the press is only picked up once the current cycle
ends — which can be a long time later. The two distinct statuses exist
because reporting both as `queued` made that invisible.

It still queues rather than refusing, on purpose: a hard-killed pod leaves
`lastResult` stuck at `"running"` forever, and a version that refused
would leave the button permanently dead with no way back. Mis-reporting is
recoverable; refusing is not.

### Errors on create

| Status | Body | Cause |
|---|---|---|
| `400` | `{"error":"name is required"}` | `name` missing or empty. |
| `400` | the full `SCHEDULE_ERROR` text | `schedule` missing or invalid. |
| `400` | `{"error":"personaId is required"}` | `personaId` missing or not a string. |
| `400` | `{"error":"unknown persona"}` | `personaId` does not resolve. |
| `400` | `{"error":"conversationId or newConversationName is required"}` | Neither supplied. |
| `400` | `{"error":"unknown conversation"}` | `conversationId` does not resolve. |
| `400` | `{"error":"unknown workflow"}` | `workflowId` supplied but does not resolve. |

## Example

```bash
curl -sX POST http://agora.agents.svc.cluster.local:8081/heartbeats \
  -H 'content-type: application/json' \
  -H "x-agora-token: $AGORA_AGENT_TOKEN" \
  -d '{
    "name": "Morning vault sweep",
    "personaId": "<a persona uuid from GET /personas>",
    "newConversationName": "Vault sweep",
    "schedule": "daily@07:00",
    "task": "Summarise anything added to the inbox since yesterday.",
    "vaultPaths": ["projects/sokrates/inbox/"]
  }'
```

## Related

- [Give an agent a recurring job](/tutorials/scheduled-agent).
- [Persona reference](/reference/agora-persona).
- [How Agora runs an agent](/explanation/agora).
