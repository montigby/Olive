# Olive — Handoff Document

> Rewritten: 2026-08-20 (previous version dated 2026-05-26 was badly stale — described
> a pre-launch, single-feature snapshot of the app. This version reflects the app as it
> stands at handoff, after a full summer of feature work and a security hardening pass.)
>
> Production: **https://myolive.app**
> Supabase project: `rgrqqxymbsgtoqurvlbb`
> Vercel: same team/project as the Supabase project's owner
> Repo: this pnpm monorepo (no other repo/service exists)

**Read this document first if you're new to the project.** It tells you what the product
is, what state it's in, where to look for more detail, and what to do first. It is
deliberately an index into the other docs, not a duplicate of them — those documents are
kept current and this one points at them rather than re-explaining what they already say
well.

| Doc | What it's for |
|---|---|
| `README.md` | Product framing — what Olive is, who it's for, priority order, feature list |
| `CLAUDE.md` | Non-negotiable engineering rules (edge direction, no `pg` in api-server, etc.) — read before touching the backend |
| `PROGRESS.md` | The living, dated changelog / task list — the most detailed record of what happened and why |
| `security.md` | Current security posture, audited against real code, meant to be re-run periodically |
| **This file** | Orientation + current state + what to do first as the new owner |

---

## 1. What Olive is, in one paragraph

Olive is a private family directory and connection app, aimed primarily at grandparents
staying in touch with kids and grandkids: a shared family tree/directory with contact
info, birthdays, relationships, and life events, plus email notifications so nobody has
to remember to check. An admin (usually a grandparent or parent) sets a family up;
individual members can then claim and maintain their own profile. Full product framing,
priority order, and target audience are in `README.md` — that document is current and
worth reading in full, not just skimming.

## 2. Current state, honestly

- **Live and stable.** No known production incidents open. The last live incident (a TLS
  misconfiguration that briefly broke login) was root-caused and fixed properly on
  2026-08-05 — see `security.md`.
- **No real (paying) families onboarded yet — deliberately.** All usage so far has been
  the team's own test data plus one standing personal test family ("Smith Family",
  belongs to the developer who built this, used for live verification throughout the
  summer). The product was kept in "not ready for real families" mode intentionally
  until the core journey and security posture were solid. As of this handoff, that bar
  has been met — see the punch list in §5 for the last couple of things worth doing
  before opening it up to anyone real.
- **Core journey works end-to-end and has been live-tested repeatedly, not just
  code-reviewed:** register → add family members (by hand or via AI chat) → fill in
  birthdays/contact/relationships → receive email notifications → optionally add life
  events and memories of family members who've passed.
- **No CI pipeline exists.** Every change is verified by hand (`tsc --noEmit`, live
  browser testing against the deployed site) and deployed via `git push` to `main`
  (Vercel auto-deploys). There is no automated test run, no staging environment, no
  preview-deploy gate beyond what Vercel does by default. Worth setting up if this
  project continues to grow — not done this summer because there was always a
  higher-priority item.

## 3. Architecture (current)

Same three-layer pnpm monorepo `README.md` describes:

- **`artifacts/api-server`** — Express backend, bundled by esbuild into a single Vercel
  serverless function (`api/index.js`). Never imports `pg` directly (external dep that
  only lives in `lib/db` — see `CLAUDE.md` rule #1).
- **`artifacts/family-branch`** — React + Vite SPA, React Query + orval-generated hooks,
  Tailwind, wouter for routing.
- **`lib/db`** — Drizzle ORM schema + connection pool + the relationship-graph data layer.
- **`lib/api-zod`, `lib/api-client-react`, `lib/api-spec`** — generated API client
  packages, orval-driven from `lib/api-spec/openapi.yaml`. As of 2026-08-04 this spec is
  in sync with the real generated output (a long-standing drift problem was fully closed
  — see `openapi_drift.md` in the auto-memory system, or just trust that a clean
  `orval codegen` run in `lib/api-spec` is now safe).

**Two person tables, same UUID, on purpose:** `persons` (rich display table — every
profile field, the source of truth for the app's UI) and `people` (lightweight
relationship-graph node, feeds `relationships`). `syncPersonToRelationshipLayer` keeps
them in sync, best-effort, on every person insert. Full rules in `CLAUDE.md` §3–5 — read
those before changing anything relationship-related, the edge direction convention
(`from_person = child, to_person = parent`) is counterintuitive and has bitten people
before.

**Current DB schema** (`lib/db/src/schema/`, 16 tables): `persons`, `people`,
`relationships`, `familyUnits`, `familyGroups`, `accounts`, `unitLinkRequests`,
`inviteTokens`, `claimRequests`, `lifeEvents`, `memories`, `memoryPromptLog`,
`memoryPromptOptouts`, `passwordResetTokens`, `emailVerificationTokens`,
`waitlistSignups`. Migrations `0004`–`0018` in `lib/db/migrations/` are all applied to
production (confirmed live as of 2026-08-17 for the last two, `0017`/`0018`).

**Current API routes** (`artifacts/api-server/src/routes/`): `auth`, `members`,
`familyUnits`, `persons`, `invites`, `inviteFlow` (shared join-link + claims system),
`linkRequests` (cross-unit linking), `summary`, `ai` (chat), `admin` (secret-gated
maintenance endpoints), `health`, `homeFeed`, `lifeEvents`, `memories`, `cron` (birthday
+ memory-prompt sends), `waitlist` (legacy, landing page no longer uses this — see §6).

**Backend shared libs** (`artifacts/api-server/src/lib/`): `visibility.ts` (tiered
visibility engine — who sees what about whom), `permissions.ts` (admin/parent/self edit
authorization), `syncRelationship.ts` (persons → graph sync), `personUpdate.ts` (shared
person-write validation, including field-length caps and photo-URL validation),
`profileCompleteness.ts`, `memoryPromptSender.ts` + `memoryPrompts.ts` (memory-prompt
targeting/cadence), `birthday.ts`, `email.ts` (Resend wrapper), `unitAccess.ts`
(same-unit / linked-unit ownership checks — **use this on every new `:unitId` route**,
see `CLAUDE.md` rule #7), `logger.ts`.

## 4. Deployment & environment

**Deploy: `git push` to `main`.** Vercel auto-builds and deploys — no manual `vercel
deploy` step, no `.vercel/project.json` CLI flow (an earlier version of this doc
described the old CLI-based flow; that's gone). Build command (must never change to
include `drizzle-kit push` — see `CLAUDE.md` rule #2):

```
pnpm install && pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/family-branch run build
```

**Required env vars, all set in Vercel (Production + Preview), none in a local `.env`
file** — there is no local `.env` anywhere in the repo, and no `DATABASE_URL` available
locally (see §7 for what that means for local dev):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string. Fails closed (app won't boot without it). |
| `SESSION_SECRET` | JWT signing key. Fails closed. |
| `OPENAI_API_KEY` | AI chat (gpt-4o with tool use). |
| `RESEND_API_KEY` | Transactional email (birthdays, invites, claims, memory prompts). |
| `ADMIN_SECRET` | Gates `/api/admin/*` maintenance endpoints. Fails closed as of 2026-07-15 — no hardcoded fallback exists anymore, don't reintroduce one. |
| `CRON_SECRET` | Authenticates Vercel's cron-triggered requests (`Authorization: Bearer`), also accepted as `x-cron-secret` for manual testing. |
| `APP_BASE_URL` | Used to build invite/claim/reset links in emails. |
| `NODE_TLS_REJECT_UNAUTHORIZED` | **Do not remove without reading `security.md` first.** Deleting this once caused a real production login outage — the proper scoped fix (stripping `sslmode` from the connection string so the pool's own `ssl` option takes effect) already shipped 2026-08-05, but this env var is still present. See §5 if you want to finish the job properly (real CA cert validation). |

**Cron jobs** (`vercel.json`): `birthday-emails` daily at 12:00 UTC, `memory-prompts`
daily at 13:00 UTC. **Vercel Hobby plan caps at 2 cron jobs — this is already at the
limit.** A third scheduled job needs a plan upgrade (ask before starting anything that
would add one — see the spending rule in §7).

**Account ownership:** the Vercel and Supabase accounts belong to the project owner
(not tied to any one contributor's personal login) — whoever inherits this project needs
to be added as a collaborator/member on both, or get the login handed off directly.
This is infrastructure-level access, separate from anything in this repo.

## 5. What to do first (priority order)

1. **Read `README.md` in full**, then skim the last ~150 lines of `PROGRESS.md` (the
   "START HERE" section at the top plus the most recent session summaries) to see
   exactly what happened most recently and why.
2. **Confirm you have Vercel + Supabase access** before touching anything live — see §4.
3. **Two small, low-risk cleanup items were being closed out at the very end of this
   handoff window** (may or may not be finished depending on when you're reading this —
   check `PROGRESS.md`'s top section for their actual status):
   - Verifying/finishing deletion of a couple of orphaned test families in the DB
     (query pattern for finding test data is documented in `PROGRESS.md`/memory —
     Gmail `+alias` emails, `%test%`/`%audit%` name matches, low member count + no
     recent login).
   - A no-login, one-click unsubscribe link for memory-prompt emails (magic-token
     pattern, same shape as the existing invite-claim links).
4. **Before onboarding any real (non-test) family**, re-run the `security.md` audit one
   more time — its own stated policy is to re-check before real users arrive and after
   any auth/payments/new-personal-data-field work, and there's been a lot of the latter
   this summer. It's a quick pass (grep for the known bug classes it already documents),
   not a from-scratch audit.
5. **Decide on a business model** before building any billing — genuinely undecided.
   Freemium, billed per household (not per person), was the researched recommendation
   as of 2026-07-22 — see `PROGRESS.md`/the business-model notes for the comparison
   (Cozi, FamilyWall, Storyworth) and reasoning. Nothing is built toward this yet by
   design.
6. **After that**, the open backlog (reply-to-email for memories, geographic map,
   Ancestry.com import, real landing-page photography, dependency-audit CI) is listed
   in `PROGRESS.md`'s Backlog section, roughly in priority order. None of it is
   blocking — it's genuine "nice to have next."

## 6. Things that look like bugs but aren't (save yourself the investigation)

- **`replit.md`** and the `REPLIT_DEV_DOMAIN` env var reference are legacy — the app no
  longer runs on Replit, this is dead config left over from an earlier hosting setup.
  Harmless, not worth cleaning up unless you're already in that file.
- **`waitlist.ts` / `waitlistSignups` table** are legacy — the landing page used to be a
  waitlist-signup page; it was converted to a direct self-serve "Create Directory" flow
  on 2026-07-20. The route and table still exist and still work, just unused by the
  current landing page.
- **The family tree page (`tree.tsx`) has known, deliberately-unfixed rendering bugs**
  (duplicate-node mislabeling, occasional multi-second hangs). The tree view was
  explicitly deprioritized by product direction back in June — don't sink time into it
  unless that direction changes. See `README.md`'s priority order.
- **Local dev is backend-blind.** There's no `DATABASE_URL`/`OPENAI_API_KEY` available
  locally, so the API server and AI chat can't be run or tested on a dev machine — the
  standing pattern all summer has been "deploy, then verify against the live site" (a
  `claude-in-chrome`-style browser automation tool was used for this throughout — any
  successor doing manual QA should expect to do the same: test against
  `https://myolive.app` directly, using a throwaway test family, not local data). The
  frontend alone *can* run locally but the `node_modules` in this environment was
  missing Windows-native optional-dependency binaries; not relevant if you're not on
  Windows, and easily reinstalled if you are (four `pnpm add <pkg>@<exact-version>
  --ignore-scripts` calls — not worth documenting further here since it's
  machine-specific, not a real project constraint).

## 7. Working norms worth carrying forward

- **Ask before any spend.** No paid tier upgrades (Vercel/Supabase/etc.), new paid
  services, or domain purchases without checking with whoever owns the budget first.
- **Verify live, not just typecheck.** Several real bugs this summer (a field-name
  mismatch, a scroll-restoration race, a last-admin-guard edge case) passed a clean
  `tsc --noEmit` and still failed the very first live click-through. A clean typecheck
  is necessary, not sufficient.
- **Use throwaway test families for anything that sends real email or touches
  destructive flows** — register a fresh account under a `+alias` address, exercise
  the flow, self-delete when done (Settings → Delete Account handles full cleanup
  including the family unit, as of 2026-07-25). Never test against the standing "Smith
  Family" test data if the test could email or delete something unexpectedly.
- **Any `:unitId`-scoped route needs an explicit ownership check** — `requireAdmin`
  alone does not verify the URL's unit belongs to the caller. This exact bug class
  caused 6 real cross-family data leaks, found and fixed 2026-07-21. See `CLAUDE.md`
  rule #7 and `unitAccess.ts`.
