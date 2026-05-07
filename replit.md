# Olive

A private living family directory where families stay connected — members claim their profile, admins manage the unit, and the family tree grows by linking related units.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET` (JWT signing key)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (Wouter routing, TanStack Query, shadcn/ui, Tailwind, React Flow)
- API: Express 5 with JWT auth (`SESSION_SECRET`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod (`zod/v4`), `drizzle-zod`, Orval-generated schemas (`lib/api-zod`)
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/api-spec/orval.config.ts` — Orval codegen config
- `lib/api-zod/src/generated/api.ts` — generated Zod schemas (do not edit)
- `lib/api-client-react/src/generated/api.ts` — generated React Query hooks (do not edit)
- `lib/api-client-react/src/custom-fetch.ts` — HTTP client with JWT via `setAuthTokenGetter`
- `lib/db/src/schema/` — Drizzle ORM schema (5 tables)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — JWT middleware, `signToken`, `verifyToken`
- `artifacts/family-branch/src/` — React frontend
- `artifacts/family-branch/src/lib/auth.tsx` — AuthProvider + `useAuth` hook

## Architecture decisions

- **Contract-first**: OpenAPI spec → Orval generates both Zod schemas (server validation) and React Query hooks (client fetching). Never handwrite these.
- **JWT in localStorage**: Token stored as `familyBranchToken`, attached via `setAuthTokenGetter` in `custom-fetch.ts`. No cookie sessions.
- **Person-centric model**: Every account is tied to a `Person` record in a `FamilyUnit`. An admin creates stub persons and invites them via token link to claim their profile.
- **Tree via parent FK**: `family_units.parent_unit_id` self-references; `parent_link_status` tracks pending/accepted state. The tree is resolved recursively at query time.
- **`timestamp({ withTimezone: true })`**: Use this — not `timestamptz` — for all timestamps in Drizzle schema (drizzle-orm 0.45.x).

## Product

- **Landing**: Marketing page → register / log in
- **Register**: Creates family unit + admin person + account in one transaction
- **Dashboard**: Unit summary stats, upcoming birthdays, pending link requests
- **Members**: Directory with claimed/unclaimed chips, per-row invite link generation
- **Profile**: Full profile edit (contact, address, social, birthday)
- **Tree**: React Flow visual tree of unit + linked units; member nodes with avatars
- **Link**: Search for and send link requests to other family units
- **Settings**: Rename unit, manage incoming/outgoing link requests
- **Invite claim**: Public page where invited members create their account and claim a pre-existing Person record

## User preferences

- Warm, intimate brand — cream (#FAF7F2) + sage (#4A7C59) + dusty rose (#C4826A)
- Cormorant Garamond (serif) for headings/names, DM Sans for body
- No emojis in UI
- All API hooks must be used somewhere

## Gotchas

- After editing `openapi.yaml`, run codegen then fix `lib/api-zod/src/index.ts` if Orval overwrites it (must only export `./generated/api`)
- `req.params.xxx` in Express is typed `string | string[]` — always cast with `String(req.params.xxx)` in route handlers
- Do not add leaf packages to root `tsconfig.json` references
- `pnpm run typecheck` is authoritative; ignore editor LSP disagreements
- **Wouter v3 nested-route params bug**: `useParams()` inside a component nested under `<Route path="/:path*">` returns the outer route's params (e.g. `{ path: "members/uuid" }`), not the inner route's (e.g. `{ personId: "uuid" }`). Fix: parse from URL directly — `const id = useLocation()[0].match(/\/members\/([^/]+)/)?.[1]`

## Pointers

- `pnpm-workspace` skill — workspace structure, TS project references
- `lib/api-spec/openapi.yaml` — full API contract
- `artifacts/api-server/src/middlewares/auth.ts` — JWT helpers
