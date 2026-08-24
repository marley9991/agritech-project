# Programmatic SEO Agent

This repository now includes a production-oriented programmatic SEO pipeline for B2B software, AI tools, and productivity integrations. It is implemented as a Node.js module that extends the existing Express/PostgreSQL application rather than replacing the AgriConnect marketplace frontend.

> Every page is generated from structured records, validated before publication, and includes an immediate answer box, a comparison matrix, tracked calls to action, and FAQ/Product JSON-LD markup.

## Architecture

| Layer | Implementation | Purpose |
|---|---|---|
| Catalog | `seo-agent/catalog.js` | Seed catalog of 100 tools across 10 categories and deterministic peer mappings. |
| Database | `seo-agent/schema.sql` | Stores tools, comparisons, generation runs, and page audits. |
| Renderer | `seo-agent/lib/core.js` | Produces static HTML, title formulas, metadata, tables, CTAs, and JSON-LD. |
| Batch engine | `seo-agent/lib/generator.js` | Uses worker threads for rendering, validates every page, writes only passing pages, and emits an index plus sitemap. |
| CLI | `seo-agent/scripts/*.js` | Seeds PostgreSQL, generates database-backed pages, creates an offline demo site, and validates output. |
| HTTP surface | `server.js` | Adds SEO stats, admin-protected generation, and static SEO page routes. |

## Commands

The database-backed workflow expects `DATABASE_URL` to point to PostgreSQL.

```bash
npm install
npm run seo:seed
npm run seo:generate
npm run seo:validate
```

For a reproducible local build without PostgreSQL, use the included catalog fixture:

```bash
npm run seo:generate:demo
npm run seo:validate
npm test
```

The demo build creates 400 pages: 200 comparison pages and 200 integration pages. It also writes `seo/index.html` and `seo/sitemap.xml`.

## URL and title patterns

Comparison pages are written under `/seo/alternatives/[tool]-vs-[competitor]` and use the title formula `[Tool] vs [Competitor] (2026): Pricing, Features & Alternatives`. Integration pages are written under `/seo/integrations/how-to-connect-[tool]-to-[tool]` and use the title formula `How to Connect [Tool A] to [Tool B] via API & Automation`.

The generated page HTML is static and can be served by the existing Nginx layer. Express also exposes the same files for local/API-container operation. The generated canonical URLs use `SEO_SITE_URL`, which defaults to `http://localhost:3000`; set it to the public site origin during deployment.

## HTTP endpoints

| Method | Endpoint | Protection | Behavior |
|---|---|---|---|
| `GET` | `/api/seo/stats` | None | Returns tool, comparison, and latest-run counts. |
| `POST` | `/api/seo/generate` | `x-admin-key` or `?key=` | Runs the database-backed generator and returns counts. |
| `GET` | `/seo` | None | SEO landing/index page. |
| `GET` | `/seo/sitemap.xml` | None | Generated XML sitemap. |
| `GET` | `/seo/alternatives/:slug` | None | Static comparison page. |
| `GET` | `/seo/integrations/:slug` | None | Static integration page. |

## Validation behavior

The renderer rejects pages when required data is null or empty, a slug is malformed, the answer box or matrix is missing, JSON-LD is absent, CTA tracking is absent, or the rendered content hash is duplicated within the run. External URLs are validated for presence and URL shape in the current implementation; a future production hardening pass can add rate-limited online HEAD checks for `source_url` and affiliate destinations before publishing.

The database keeps a complete audit trail in `seo_generation_runs` and `seo_page_audits`, including rejected-page errors and content hashes. This makes the publish gate observable and allows later additions such as an editorial approval state.

## Data and affiliate assumptions

The 100-row catalog is a development seed and not an endorsement or live pricing feed. Seeded prices and ratings are deterministic placeholders for exercising the page-generation workflow. `AFFILIATE_BASE_URL` controls the base destination for tracked affiliate links and defaults to `https://example.com/affiliate`. Replace the catalog values with verified commercial data and approved affiliate URLs before exposing pages publicly.

## Deployment notes

`Dockerfile` now includes the SEO agent and generated route directory. `docker-compose.yml` was corrected to match the repository’s actual flat layout and mounts the SEO schema as an additional PostgreSQL initialization script. On a fresh database, the main marketplace schema, demo seed, and SEO schema initialize in order. On an existing database, `server.js` applies the SEO schema additively at startup.

The generator itself is intentionally explicit rather than running on every server boot. Run it after catalog updates, through a deployment job, or through the protected `POST /api/seo/generate` endpoint. This prevents an application restart from silently publishing a large page set.
