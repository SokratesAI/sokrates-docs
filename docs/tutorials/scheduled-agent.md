---
id: scheduled-agent
title: Give an agent a recurring job
sidebar_position: 2
---

# Give an agent a recurring job

In this tutorial you will build an agent that wakes up on its own every
morning, reads part of your vault, and writes what it found into a chat
thread you can scroll back through.

You will build it out of three records, because Agora keeps *who*, *where*
and *when* separate. By the end you will have made all three and watched
them fire.

**What you need**: access to the Agora Studio in a browser. No terminal,
no YAML, no credentials.

**Time**: about ten minutes, plus one wait for the schedule to fire — or
none, because step 5 shows you how to make it fire immediately.

:::note
Everything you create here is safe to delete afterwards, and step 6 shows
you how. Nothing in this tutorial spends metered API credit as long as you
pick the model in step 2 as written.
:::

## 1. Decide what the job actually is

Before touching the UI, write one sentence describing the job as if you
were asking a colleague. Something narrow enough to be checkable, like:

> Summarise anything added to my inbox folder since yesterday, in at most
> five bullets. If nothing was added, say so in one line.

Keep that sentence. It becomes the heartbeat's **task** in step 4, and
"narrow enough to be checkable" is what will let you tell whether this
worked.

## 2. Create the persona — the *who*

Open the Studio and go to **Personas** → **New persona**.

Fill in:

- **Name**: `Morning Sweeper`
- **Personality**: this is the persona's standing instructions, not the
  job. Something like: *You are terse. You report what you actually found
  and never pad. If a folder was empty, one line is the correct answer.*
- **Model**: pick an entry whose label ends in **(CLI)**.

That last choice matters more than it looks. A model id is
`"<provider>:<model id>"`, and the `claude-cli:` provider runs on a flat
subscription while the `anthropic:` provider is billed per token against a
prepaid balance. The two lists hold the same underlying models, so the
CLI entry costs you nothing in capability — but the labels point the wrong
way, with the metered options carrying the plainer names. Read the
provider prefix, not the label.

Under **Capabilities**, turn on **vaultRead** if it is not already on
(it is on by default), and leave everything else off. Your agent needs to
read the vault and nothing more. Capabilities are enforced by the runner
from this saved record on every single turn, so anything you leave off
here is genuinely unavailable to it later.

Save. You now have a persona but nothing that talks to it.

## 3. Create the conversation — the *where*

Go to **Conversations** → **New conversation**.

- **Name**: `Morning sweep`
- Attach `Morning Sweeper` as the participant.

Say hello to it and wait for a reply. This is not busywork — it is the
cheapest possible check that the persona, the model and the provider all
work, *before* you attach a schedule and find out at 07:00 tomorrow that
they do not.

If you get a reply, both records are good.

:::tip
You can skip this whole step later on. The **New heartbeat** form can
create an empty conversation for you in one go. Do it by hand this first
time so you can see that the "agent's output" is just an ordinary chat
thread with an ordinary message in it.
:::

## 4. Create the heartbeat — the *when*

Go to **Heartbeats** → **New heartbeat**.

- **Name**: `Morning sweep`
- **Persona**: `Morning Sweeper`
- **Conversation**: `Morning sweep`
- **Schedule**: choose **Daily at** and set `07:00`. (The form also offers
  **Every** for intervals and **Cron expression** for anything those two
  cannot express.)
- **Task**: paste the sentence you wrote in step 1.
- **Vault paths**: add the folder your inbox lives in, with a trailing
  slash — a trailing `/` means "everything under this folder", without it
  the path is a single document.

Save.

Schedules are evaluated in **Europe/Oslo** local time. If you chose
**Every** with an anchor time, note that the interval has to divide 24
hours evenly — `every@6h@12:00` is accepted, `every@7h@12:00` is refused,
and the [heartbeat reference](/reference/agora-heartbeat#the-anchored-interval-restriction)
explains the midnight bug that restriction avoids.

## 5. Make it fire now

You do not have to wait until 07:00. Press **Run now** on the heartbeat.

Nothing appears to happen immediately, and that is correct. Agora does not
push work to the runner — the runner polls. "Run now" sets a flag; the
runner picks it up on its next poll and performs the turn then.

When it does, three things change:

1. The vault paths are fetched **fresh, right then** — not as they were
   when you saved the heartbeat.
2. A new message appears in the `Morning sweep` conversation, from
   `Morning Sweeper`, exactly like a reply you had asked for by hand.
3. The heartbeat's row shows a one-line result, such as `replied 214
   chars` — or `failed: ...` with the reason.

Open the conversation and read what it wrote.

### If it did not do what you wanted

Check them in this order, because each rules out the ones below it:

- **The heartbeat's result line says `failed:`** — the reason is in that
  line. A model or provider problem, most often.
- **The result line says nothing changed and the row looks untouched** —
  confirm the heartbeat is **enabled**. Disabled heartbeats are never
  evaluated at all.
- **You pressed Run now twice and only got one reply** — that is by
  design. Pressing it during a run does not start a second one; the poll
  loop is single-threaded, so the second press is picked up only after the
  current run finishes. The button reports `already-running` rather than
  `queued` when it can tell.
- **It replied, but ignored your folder** — check the trailing slash on
  the vault path, and check that `vaultRead` is on for the persona.
- **It replied, but rambled** — that is the persona's personality, not the
  task. Edit the persona; it changes everywhere that persona is used.

## 6. Change it, or take it apart

You now have a working scheduled agent. Some things worth trying, since
they are what the three-record split buys you:

- **Point the same schedule at a different persona.** Edit the
  heartbeat's persona. Nothing else changes — same thread, same history.
- **Give the same persona a second schedule.** Create another heartbeat
  naming the same persona and a different conversation.
- **Read the whole history.** The conversation is a normal thread. Scroll
  it, search it, fork it from any message.

To take it apart, delete the heartbeat first — it is the only one of the
three that does anything on its own. The persona and the conversation are
inert without it, and you can delete them at your leisure.

## What you learned

- A persona is *who*, a conversation is *where*, a heartbeat is *when*,
  and a heartbeat firing produces an ordinary message in an ordinary
  thread rather than some separate kind of output.
- Capabilities are granted on the persona and enforced by the runner from
  that saved record, so what you leave off is genuinely off.
- The provider prefix on a model id decides how the turn is billed, and
  the labels do not.
- The runner polls; nothing pushes. "Run now" is a flag, not a trigger.

## Next

- [How Agora runs an agent](/explanation/agora) — why it is built this
  way, and what happens on the two ports.
- [Heartbeat reference](/reference/agora-heartbeat) — the full schedule
  grammar, including cron.
- [Persona reference](/reference/agora-persona) — every capability and
  what it grants.
