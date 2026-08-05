# sokrates-docs

Sokrates developer documentation. [Docusaurus](https://docusaurus.io/) site,
structured with [Diátaxis](https://diataxis.fr/) (`docs/tutorials`,
`docs/how-to`, `docs/reference`, `docs/explanation`).

Served in-cluster behind Tailscale ingress, ordered via the Platform
Product Catalog (`platform-config/crossplane/service-sokrates-docs.yaml`) —
same pattern as every other internal service on the platform.

The `docs/reference/` section is kept current by
[`.github/workflows/docs-sync.md`](.github/workflows/docs-sync.md), a
[gh-aw](https://github.com/github/gh-aw) workflow (Gemini engine) that
runs weekly and opens a PR when it finds drift. Tutorials, how-to guides,
and explanations are human-authored on purpose.

## Local development

```bash
npm install
npm start       # dev server with live reload
npm run build   # static build -> ./build
npm run serve   # serve the production build locally
```

## Requires

A `GEMINI_API_KEY` repo secret (free tier from
[Google AI Studio](https://aistudio.google.com/api-keys)) for `docs-sync`
to run. `ORG_APP_ID`/`ORG_APP_PRIVATE_KEY` are already provisioned by the
Platform Product Catalog composition for the config-repo image-digest bump
in `build.yaml`.
