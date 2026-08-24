# Olive — New Contributor Setup Guide

This is a standalone onboarding doc — send it to anyone before they have repo access,
so they know what to ask for and what to install. Once they're in the repo, `HANDOFF.md`
takes over as the real index into the project (product framing, architecture, current
state, what to do first). This doc only covers *getting set up*, not the project itself.

**One-line orientation:** Olive is a private family directory and connection app, live at
https://myolive.app. pnpm monorepo, Express + React + Postgres (Supabase), deployed on
Vercel via `git push`. Full detail lives in `README.md`/`HANDOFF.md` once you can read them.

---

## Phase 1 — Accounts you'll need

Three of these are shared infrastructure you need to be *added to*, not accounts you
create yourself. One is yours alone.

| Account | What it's for | How to get access |
|---|---|---|
| **GitHub** | Hosts the private repo, `github.com/montigby/Olive` | Ask whoever sent you this doc to add your GitHub username as a collaborator on the repo. |
| **Vercel** | Hosts the app, auto-deploys on every push to `main`, and holds every secret/env var the app needs (`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_SECRET`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, etc.) | Ask to be added as a team member on the project's Vercel team. |
| **Supabase** | Hosts the Postgres database (project `rgrqqxymbsgtoqurvlbb`) | Ask to be added as a project member. Only needed for direct SQL/schema work — most day-to-day changes don't touch this directly. |
| **Anthropic (Claude Code)** | Runs Claude Code, the AI coding assistant this project has been built with all along | This one's yours — sign up individually at claude.ai or console.anthropic.com. Not shared infra. |

**You do *not* need your own Resend or OpenAI account.** Those API keys already live in
Vercel as shared environment variables — you get access to what they enable by getting
Vercel access, not by signing up yourself.

---

## Phase 2 — Local tools to install

- **Git**
- **Node.js** — the project doesn't pin an exact version (no `.nvmrc`/`engines` field),
  but has most recently been developed against Node 24.x. Use a reasonably current LTS
  or later.
- **pnpm** — this is a pnpm-only monorepo; a `preinstall` script actively blocks `npm`/
  `yarn` from being used. Install via `corepack enable` or `npm install -g pnpm`.
- **Claude Code** — `npm install -g @anthropic-ai/claude-code`, then run `claude` from
  inside the project folder (see Phase 4). If you'd rather not use npm for this, the
  official docs at docs.claude.com/claude-code cover other install methods.

---

## Phase 3 — Get the code running locally

```
git clone https://github.com/montigby/Olive.git
cd Olive
pnpm install
pnpm run typecheck
```

Clone it wherever's convenient — there's no required folder name or location, `Olive` is
just the natural default from `git clone`. Run `pnpm install` from the **repo root**, not
a subfolder — this is a monorepo and the workspace links depend on installing from the top.
`pnpm run typecheck` should finish clean; if it doesn't, something's wrong before you've
even touched any code, worth chasing down first.

Once that's clean, it's worth knowing the top-level shape before diving in further:

- `artifacts/api-server` — Express backend
- `artifacts/family-branch` — the React + Vite frontend
- `lib/db` — Drizzle ORM schema and the relationship-graph data layer
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` — generated API client packages

Full architecture detail is in `CLAUDE.md` (non-negotiable engineering rules — read this
before changing backend code) and `HANDOFF.md` §3.

**Important local-dev limitation:** there's no `DATABASE_URL` or `OPENAI_API_KEY`
available locally, so the backend and AI chat can't actually run or be tested on a dev
machine — no local `.env` file exists anywhere in the repo, on purpose. The frontend
alone *can* run locally (`pnpm --filter @workspace/family-branch dev`), but with no live
backend behind it. The standing pattern all along has been: make a change, deploy it
(`git push` to `main`), then verify against the real site (https://myolive.app) — ideally
using a disposable test account (a `+alias` on your own email), never real family data.

**Windows users:** a fresh `pnpm install` has previously been missing some Windows-native
optional-dependency binaries for a couple of packages. If you hit native-binding errors
that a plain `pnpm install` doesn't resolve, that's a known rough edge, not a sign
something's fundamentally broken — troubleshoot per-package (reinstalling that one
dependency at its exact pinned version, `--ignore-scripts`, tends to work) or ask for help.

---

## Phase 4 — Get Claude Code oriented

Run `claude` from inside the cloned `Olive` folder (not a parent or subfolder) — it needs
to be run from there to pick up `CLAUDE.md` automatically, which carries the project's
non-negotiable rules (the relationship-graph edge direction convention, never importing
`pg` directly in `api-server`, never adding `drizzle-kit push` to the build command, etc.).

A good first prompt, and genuinely how most sessions on this project have started:

> Read `HANDOFF.md`, `README.md`, and the top ~150 lines of `PROGRESS.md`, and summarize
> where this project stands and what's worth doing next.

Claude Code also carries a persistent memory system that's built up real project history
over many sessions — it's often worth asking it what it remembers about a topic before
assuming it needs the full story typed out again.

---

## Phase 5 — How deploys work

`git push` to `main` → Vercel auto-builds and deploys. No manual deploy step, no staging
environment, no CI pipeline exists. Build command (do not change this to add
`drizzle-kit push` — it's interactive and will hang in Vercel's build):

```
pnpm install && pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/family-branch run build
```

Because there's no staging environment or automated test suite, the norm has been to
verify by hand before pushing (`tsc --noEmit` clean) and to click through the real change
on the live site right after it deploys — a clean typecheck has caught far fewer real
bugs on this project than an actual live check has.

---

## Phase 6 — First-day checklist

- [ ] GitHub access confirmed — can clone the private repo
- [ ] Vercel access confirmed — can see the project dashboard and its env vars
- [ ] Supabase access confirmed — can open the SQL editor for project `rgrqqxymbsgtoqurvlbb`
- [ ] Claude Code installed, `claude` runs cleanly from inside the cloned repo
- [ ] `pnpm install` and `pnpm run typecheck` both succeed with no errors
- [ ] Read `HANDOFF.md` in full — it's the real starting point, this doc's job ends here
- [ ] Skimmed the top of `PROGRESS.md` for the most recent session's state
- [ ] Read `security.md` and `CLAUDE.md` before making any change

---

## Who to ask

The GitHub org, Vercel team, and Supabase project are shared infrastructure, not owned by
any single past contributor. Whoever sent you this document is the right person to ask
for access to all three.
