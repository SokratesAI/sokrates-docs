---
id: board-records
title: Board records — why the boards are leaving markdown
sidebar_position: 5
---

# Board records — why the boards are leaving markdown

:::note Status

Everything on this page is implemented on the `board-records-switchover` branch of
`agora-persona-runner` (draft PR #968), not on `main`. The store, the migration and
the markdown readers land in **one** change, deliberately, so until that merges the
modules described here exist but nothing calls them. The design it implements is the
approved `board-records.md` spec.

:::

## The short answer

**CouchDB. A document store, not a relational one.** One document per board row.
No tables, no foreign keys, and no joins performed by the database. The single
modelled relationship — a row's project and milestone pointing at a registry
document — is joined in application code, in exactly one function.

So a *shape* diagram of the records is meaningful and appears below. A relational
schema diagram is not, and there is no SQL to write against this.

## Why not markdown

A board today is a markdown table. Roughly two dozen modules read it, and each one
parses it with its own regular expressions. One file, twenty-three readings, and no
way to query it for anything.

The argument for moving is not that databases are nicer. It is that a row should
have **one** reading. Every reader ends up behind a single accessor that returns
the same four collections, or it does not read the board at all.

That leads to the spec's hardest rule: **there is no facade phase**. It would be
natural to ship an accessor that reads records where they exist and falls back to
parsing markdown where they do not, then convert readers one at a time. That is
rejected, because the window in which two stores are both authoritative is the
exact failure the migration exists to remove. The accessor reads records or it
raises.

## One database, four id namespaces

CouchDB is one database per vault, and a second database would need its own
credentials, its own backup and its own reason to exist. So the board store shares
the database the ticket mirror already uses, and separates itself by id prefix:

```text
ticket:<path>:<n>      the existing ticket mirror        (not part of this migration)
board:<board>:<n>      a board row                       e.g. board:issue:41
capture:<board>:<id>    a capture — an owner's own bullet  e.g. capture:issue:7
board:registry         the id registry
```

Two of those choices are load-bearing rather than cosmetic.

**Rows and captures are two separate key ranges, and reading a board takes two
queries.** It is tempting to put a capture at `board:issue:capture:7` so that one
range read returns everything and the `type` field sorts them out afterwards. That
is wrong in a way that destroys data: such an id falls inside the row range, so a
row read hands it back as a row with no number, and the row writer's default
pruning — which tombstones stored documents that the caller did not include —
would delete every capture the owner has ever written, the first time any migration
wrote the rows alone. Captures therefore live outside the row range, and the
accessor asks the store twice.

**The registry id has two segments, not three,** for the same class of reason. With
a third segment it would sit inside a board's range, come back from a row read, and
fail one layer later inside the row parser — a long way from the naming decision
that caused it.

## What a row looks like

```json
{
  "_id": "board:issue:41",
  "type": "row",
  "board": "issue",
  "number": 41,
  "title": "...",
  "projectId": "prj_nova",
  "milestoneId": "ms_7",
  "rank": "0|hzzzzz:",
  "priority": "high",
  "size": "m",
  "status": "open",
  "updated": "2026-09-08T17:00:00Z"
}
```

**Derived fields are deliberately absent.** The markdown parser hands callers a
sort key alongside each of status, priority and size. Those are pure functions of
the cell, recomputed on every read. Storing them would put a second copy in the
document that can disagree with the first, and nothing would notice until a
rendered board differed from a queried one. Their absence is a schema decision, not
an oversight.

## The shape

```text
                      board:registry
                { projects, milestones, captures }
                          ^        ^
            projectId ----'        '---- milestoneId
                          |
                          |   (joined in application code, not by the database)
                          |
         board:issue:41   type = row      rank -> position on the board
         board:issue:42   type = row
         board:idea:7     type = row

         capture:issue:7  type = capture  (separate key range, separate read)
```

## Three things that are easy to get wrong

### Wire order is not board order

CouchDB returns ids in lexical order, and these ids end in a decimal number, so
`board:issue:100` comes back before `board:issue:2`. Every read re-sorts in
application code and no caller may rely on the order the database gave.

The sort key is a **pair**, not simply the rank. A completed row carries no rank at
all — the document builder leaves the field off rather than inventing a position —
and the obvious `rank or ""` default puts every unranked row *first*, because the
empty string sorts below every valid rank key. Unranked means "nobody has placed
this", which belongs at the end. So the key is: ranked before unranked, then the
rank, then the number. That last tie-break is what makes a read fully deterministic
rather than merely usually deterministic — the alternative surfaces as a diff in a
generated markdown view and nowhere else.

### A dangling reference raises; a missing one falls back

A row with **no** project gets the default project. Nobody has filed it yet, and
that is the honest rendering.

A row whose `projectId` the registry does not hold **raises**. Rendering that as the
default would put an orphaned row on the board looking as though it had been filed,
which is precisely what stable ids exist to prevent.

### Whole-document writes are checked before they land

Writing the registry replaces the entire document, so the writer refuses anything
that is not a registry before it overwrites one. An empty dictionary would erase
every minted id in a single request and orphan every reference on every row, with
no undo short of a database backup.

One field of the registry — the capture counter map — is validated only when it is
present. Every registry written before captures existed lacks it, and requiring it
would make the stored registry unwritable; recovering from *that* means hand-editing
the one document every row points at.

## An unmigrated store answers nothing

A store that has never been written cannot answer for a board, and says so with a
dedicated exception. It subclasses the general record error on purpose: every reader
the migration touches already catches that to mean "this sweep did not see that
board" and exits non-zero. The guard therefore reaches all of them without editing
all of them, and a reader that forgets to handle it inherits the safe behaviour
instead of the silent one.
