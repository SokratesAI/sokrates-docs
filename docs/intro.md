---
id: intro
title: Sokrates Developer Docs
slug: /
sidebar_position: 1
---

# Sokrates Developer Docs

Developer documentation for the SokratesAI platform, organized using the
[Diátaxis](https://diataxis.fr/) framework:

- **[Tutorials](/tutorials/intro)** — learning-oriented, hands-on lessons for newcomers.
- **[How-to guides](/how-to/intro)** — goal-oriented steps for a specific task.
- **[Reference](/reference/intro)** — information-oriented, accurate technical descriptions (kept current automatically — see below).
- **[Explanation](/explanation/intro)** — understanding-oriented discussion of design and why things work the way they do.

## Self-documenting

The **Reference** section is kept in sync with the codebase by a
[`gh-aw`](https://github.com/github/gh-aw) agentic workflow (using the Gemini
engine) that runs in CI and proposes doc updates as pull requests when code
changes. Tutorials, how-to guides, and explanations stay human-authored and
human-reviewed — those need judgment, not just fact-checking against source.
