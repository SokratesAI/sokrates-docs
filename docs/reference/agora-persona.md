---
id: agora-persona
title: Agora Persona
sidebar_position: 3
---

# Persona

The record that defines *who* an Agora agent is: personality, model,
capability grants, and cross-conversation memory. Personas are reusable —
one persona can participate in many conversations, and editing it changes
it in all of them.

- **Stored as**: one JSON file per record, under `personas/` in Agora's
  data volume.
- **Created via**: Studio → **Personas** → **New persona**, or
  `POST /personas`.

## Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | generated | UUID. Assigned on create; not settable. |
| `name` | string | — | **Required.** Must be non-empty. Not enforced unique, but `findByName` returns the first match, so duplicates are a bad idea. |
| `personality` | string | `""` | The persona's system-prompt text. |
| `model` | string | — | **Required.** `"<provider>:<model id>"`, and must be a member of the model catalog — an unknown value is rejected with `400 unknown model`. |
| `thinking` | boolean | `false` | Enables extended thinking. Only meaningful on models whose catalog entry sets `supportsThinking`. |
| `claudeCliRestricted` | boolean | unset | `claude-cli` personas only. When true, applies the bridge's full known-tool denylist to this persona's calls. Unrestricted is the default, matching an interactive Claude Code session. Ignored by every other provider. |
| `claudeCliStateless` | boolean | unset | `claude-cli` personas only. When true, the bridge never reads or writes this conversation's stored CLI session — every turn gets the full system prompt and starts fresh, with no `--resume`. Off by default; ordinary chat personas want turn-to-turn continuity. |
| `capabilities` | object | see below | Capability grants. Enforced server-side from this record, never from a request payload. |
| `sharedMemory` | string | `""` | Cross-conversation scratchpad. Editable in the Studio and writable by the persona itself via the runner's `save_memory` tool. |
| `isTemplate` | boolean | `false` | Marks the record as a template. Templates are ordinary editable records, never auto-attached to conversations. |
| `createdAt` | string | generated | ISO 8601. |
| `updatedAt` | string | generated | ISO 8601. |

## Capabilities

Each grant is a boolean on `persona.capabilities`. The runner reads them
from the stored persona on every invocation — a caller cannot request a
capability it was not granted.

| Capability | Default | What it grants |
|---|---|---|
| `webSearch` | `true` | Web search. |
| `vaultRead` | `true` | Read access to the Obsidian vault. |
| `vaultWrite` | `false` | Write access to the vault. |
| `codeExecution` | `false` | Code execution. |
| `kubectlRead` | `false` | Read-only cluster introspection via `kubectl_read` — `get`/`describe`/`logs`/`top`. Reading Secret objects is refused at both the tool and the RBAC level. |
| `githubRead` | `false` | Read-only GitHub queries via `github_read` — issues, PRs, runs, releases. `gh api` is GET-only. |
| `manageAgora` | `false` | Create personas, conversations, heartbeats and workflows via the runner's `create_*` tools, which call the internal app's create routes. Platform management rather than a read, so it defaults off. |
| `githubWrite` | `false` | Open real GitHub PRs via `create_pr`, using the GitHub REST API directly — no git binary, no local clone. Uses the shared bot account, so the reach is any repo that account can see, not a per-repo allowlist. |
| `githubMerge` | `false` | Merge an existing PR via `merge_pr`. The runner refuses unless every check-run on the PR's head commit is green. There is deliberately no "did this persona open it" check — every agent shares one GitHub account, so that distinction carries no signal. |
| `terminalExec` | `false` | Arbitrary shell in the runner pod via `terminal_exec` (`bash -lc`, no verb or flag allowlist). Carries the union of that pod's kubectl RBAC and its GitHub bot token — the highest blast radius in this list. |

`githubWrite` and `githubMerge` are separate on purpose: it is the same
separation of duties a human PR review provides — a persona can be allowed
to propose changes without also being allowed to merge them.

## Model identifiers

`model` is a single string of the form `"<provider>:<model id>"`. The
provider prefix determines both execution path and billing.

| Prefix | Execution | Billing |
|---|---|---|
| `anthropic:` | Anthropic Messages API | **Metered** — per token, against a prepaid balance |
| `claude-cli:` | Persistent Claude Code CLI session in `agora-claude-bridge` | Flat subscription, not per token |
| `gemini:` | Gemini API | Shared project API key |

Every `anthropic:` model has an identical `claude-cli:` twin, so switching
to the subscription path never costs you a model — only a prefix.

Each catalog entry carries `supportsThinking`, an optional
`contextWindow`, and an optional `metered` flag. `metered` is set to
`true` only on the `anthropic:` entries; it is left **undefined** on the
Gemini entries because that key's billing status has not been measured,
and the Studio only marks an entry as metered when the flag is explicitly
true.

`DEFAULT_MODEL` is `claude-cli:claude-haiku-4-5-20251001` — a
subscription-billed entry.

The live catalog is served by `GET /models`; treat that as the source of
truth for which ids are currently valid, since entries are pulled when a
model is deprecated.

## Routes

Agora serves two apps: the public one on 8080 and the internal,
token-guarded agent surface on 8081. Only three persona routes exist on
both.

| Method | Path | Apps | Notes |
|---|---|---|---|
| `POST` | `/personas` | both | Create. Requires `name` and a catalog-valid `model`. Returns `201 {"status":"created","persona":{...}}`. |
| `GET` | `/personas/:id` | both | Single record. |
| `PATCH` | `/personas/:id` | both | Partial update. `capabilities` may be partial — it is merged over the existing grants, not replaced, so omitting a key leaves it unchanged. Every other field is overwritten. |
| `GET` | `/personas` | public | List, sorted by name. |
| `DELETE` | `/personas/:id` | public | Delete. |
| `POST` | `/personas/:id/clone` | public | Clone. Defaults the new name to `<name> (copy)`. |
| `POST` | `/personas/preview` | public | Preview a persona's reply without persisting it. |
| `GET` | `/models` | public | The model catalog. |

### Errors on create

| Status | Body | Cause |
|---|---|---|
| `400` | `{"error":"name is required"}` | `name` missing or empty. |
| `400` | `{"error":"unknown model"}` | `model` missing, or not in the catalog. |
| `401` | `{"error":"invalid agent token"}` | Internal app only, when `x-agora-token` does not match. |

## Example

```bash
curl -sX POST http://agora.agents.svc.cluster.local:8081/personas \
  -H 'content-type: application/json' \
  -H "x-agora-token: $AGORA_AGENT_TOKEN" \
  -d '{
    "name": "Librarian",
    "personality": "You keep the vault tidy. Be terse.",
    "model": "claude-cli:claude-haiku-4-5-20251001",
    "capabilities": { "vaultRead": true, "vaultWrite": true }
  }'
```

Omitted capabilities fall back to the defaults in the table above, not to
`false` — `webSearch` and `vaultRead` are on unless you turn them off.

## Related

- [How Agora runs an agent](/explanation/agora) — why persona,
  conversation and heartbeat are separate records.
- [Heartbeat reference](/reference/agora-heartbeat).
