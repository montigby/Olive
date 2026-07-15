# CLAUDE.md — Family Branch

Non-negotiable rules and context for any Claude session working on this project.

---

## Project Overview

Family Branch (brand name: **Olive**) is a private family tree and directory app.  
Live at: **https://myolive.app**  
Database: **Supabase Postgres** (project `rgrqqxymbsgtoqurvlbb`)  
Deployment: **Vercel** (serverless function for API, static for SPA)

It is a **pnpm monorepo** with:
- `artifacts/api-server` — Express backend (bundled by esbuild → `api/index.js`)
- `artifacts/family-branch` — React + Vite SPA
- `lib/db` — Drizzle ORM schema, db instance, and relationship data layer
- `lib/api-zod` — Zod schemas (orval-generated)
- `lib/api-client-react` — React Query hooks (orval-generated)
- `lib/api-spec` — OpenAPI YAML

---

## Non-Negotiable Architectural Rules

### 1. Never import `pg` inside `artifacts/api-server`
esbuild bundles the API server. `pg` is an external dependency that lives only in `lib/db`. Importing it directly in any file under `artifacts/api-server/` will cause a build failure. Always use `@workspace/db`:
```typescript
import { db, pool } from "@workspace/db";
```

### 2. Never add `drizzle-kit push` to the build command
`drizzle-kit push` is interactive — it prompts for confirmation. It will hang or fail in Vercel's CI. The Vercel build command must stay:
```
pnpm install && pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/family-branch run build
```
Schema changes are applied via a one-shot HTTP endpoint or the Supabase SQL editor directly.

### 3. Edge direction: `from_person = child, to_person = parent`
In the `relationships` table, all parent-type edges (`biological_parent`, `adoptive_parent`, `step_parent`) point **FROM child TO parent**. This is counterintuitive. All traversal functions must follow this:
- `getParents(personId)` → `WHERE from_person = personId` → returns `to_person`
- `getChildren(personId)` → `WHERE to_person = personId` → returns `from_person`
- `getAncestors` climbs from_person → to_person (child → parent direction)

### 4. `persons` and `people` are parallel, same UUID
Two person tables coexist. `persons` is the rich display table (profile fields, auth, invites). `people` is the lightweight graph node. Both share the same UUID. Never try to consolidate them into one table.

### 5. Sync is always best-effort
`syncPersonToRelationshipLayer` must never throw or block the primary insert path. All its internals are wrapped in try/catch. The relationship layer is supplementary — the `persons` table insert is the source of truth for the app.

### 6. Spouse edges are symmetric (2 rows)
`addRelationship(..., "spouse")` automatically inserts both A→B and B→A. Adding a new spouse retires existing spouse edges as `ex_spouse`. Use `ON CONFLICT DO NOTHING` when inserting spouse edges manually to avoid conflicts with existing `ex_spouse` rows.

---

## Key Conventions

### Auth
JWT Bearer token, stored in `localStorage.getItem("oliveToken")`. Verified by `requireAuth` middleware. Admin routes also require `requireAdmin`. Admin-only HTTP endpoints use `x-admin-secret` header (`ADMIN_SECRET` env var — required, the server fails to start without it; no insecure default anymore).

### `formatPerson`
The canonical implementation lives in `artifacts/api-server/src/routes/auth.ts` and is exported. Import from there. Never redefine it in another file.

### New family members
Whenever a new person is inserted into `personsTable`, call `syncPersonToRelationshipLayer` afterwards. This is currently done in:
- `artifacts/api-server/src/routes/members.ts` (REST add)
- `artifacts/api-server/src/routes/ai.ts` (AI chat add)
- `artifacts/api-server/src/routes/admin.ts` (backfill — runs it for each existing person)

If you add a new path that inserts persons, add the sync call there too.

### Tree layout
The tree in `tree.tsx` has three layout functions. Only two are active:
- `layoutUnit` — admin view
- `layoutLayeredView` — non-admin viewer view
- `layoutPersonalView` — **dead code**, do not use

Both active layout functions accept an `explicitPairs: Map<string, string>` parameter that seeds spouse pairings from the DB before the heuristic runs.

### Running tests
```bash
cd lib/db
DATABASE_URL=<supabase-connection-string> pnpm test
```
Tests cannot run locally without a DATABASE_URL pointed at a Postgres instance that has the `0007_relationships.sql` migration applied.

---

## File Structure Rules

- Shared DB schema changes go in `lib/db/src/schema/` and must be reflected in `lib/db/migrations/` as raw SQL
- API routes go in `artifacts/api-server/src/routes/`
- Shared API types: update `lib/api-spec/openapi.yaml` first, then regenerate with orval
- Frontend pages go in `artifacts/family-branch/src/pages/`
- Frontend components go in `artifacts/family-branch/src/components/`

---

## Important IDs (Production)

- Spencer's family unit ID: `9b8dfa66-bef1-422e-8d3c-77c72fd94148`
- Supabase project: `rgrqqxymbsgtoqurvlbb`

---

## Supply-Chain Security

`pnpm-workspace.yaml` has `minimumReleaseAge: 1440`. Do NOT disable this. If you need a package that's too new, add it to `minimumReleaseAgeExclude` temporarily with a comment explaining why, and remove the exclusion once the 1-day window has passed.

---

## Reference

For exhaustive context on all files, decisions made, and next steps, read `HANDOFF.md`.
