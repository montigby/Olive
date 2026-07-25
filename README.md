# Olive (Family Branch)

**Live at:** https://myolive.app

A private family tree and directory app. The mission is simple: help grandparents stay genuinely connected with their kids and grandkids on the internet — without handing that connection over to Facebook.

---

## Purpose & Mission

Families drift out of touch not because they stop caring, but because staying in touch takes effort nobody quite owns: nobody updates the group text with a new address, nobody remembers whose birthday is next week, nobody keeps a family contact list current. Olive's job is to remove that friction and put it somewhere private and durable, owned by the family itself — not a social network monetizing their attention.

**Core belief:** the person most motivated to keep a family connected (usually a parent or grandparent) is often the *least* equipped, technically, to do it. So the product has to be radically simple for a non-technical, 60+-skewing audience, while still being useful to the tech-comfortable relatives who'll do a lot of the initial data entry.

## Who This Is For

Primarily grandparents who want to stay connected with grandkids and extended family — but designed to scale across many families, not just one. The admin (often a parent or grandparent) sets things up; over time, individual family members are expected to claim and maintain their own profiles.

## Priority Order (guides what gets built first)

1. **Easy data entry** — plugging in family info should be as frictionless as possible
2. **Notifications** — birthday and life-event alerts sent to the people who care
3. **AI chat** — a genuine data-entry tool (add/update people and events via plain conversation), not a novelty
4. **Landing page / first impressions** — the unauthenticated experience matters because it's the highest drop-off point
5. **Family tree visualization** — deliberately deprioritized; interesting but not core to the value prop

## What "Done" Looks Like (for the current phase)
- Every family member has a profile, even before they've ever logged in
- Birthday, contact info, and relationship data are filled in and kept current
- Grandparents receive timely, low-effort notifications about family events
- An admin can manage the family without friction, and members can increasingly self-serve

## What's Deliberately Out of Scope (for now)
- A polished family-tree visualization
- Photo sharing as a first-class feature
- SMS notifications (email-first, SMS is a possible future addition)
- Any feature that doesn't serve the directory + notifications core

---

## Features (Shipped)

- **Family directory** — profiles with contact info, birthdays, addresses, and social/payment handles (Instagram, Facebook, TikTok, LinkedIn, Snapchat, Venmo, BeReal, custom links), each independently toggleable for privacy
- **Tiered visibility** — what a viewer sees about someone else scales with how closely related they are (self/admin see everything; immediate family sees the full profile; wider family sees a reduced view with one contact method; people in a separate-but-linked family branch can be shut out entirely)
- **Viewer-relative relationship labels** — the directory shows each person's relationship *to whoever's currently logged in* (computed live from the family graph), not a label frozen to whoever originally set up the tree
- **Life events** — marriages, new babies, graduations, and other milestones, with flexible date precision (year-only, year+month, or full date)
- **Birthday notifications** — daily email check (Resend) for day-before reminders and a Monday weekly digest, with an "add to calendar" button (Google Calendar + downloadable `.ics`) on the Birthdays page
- **AI chat assistant** — add, update, and remove family members and life events through plain conversation; scoped so it can never act outside the authenticated user's own family unit
- **Multi-admin support** — more than one admin per family, with a guaranteed floor of at least one admin at all times (enforced across every code path that could zero it out: revoke, delete-person, AI chat delete, and cross-family account merges)
- **Layered permissions** — admins edit anyone; parents edit their own kids' profiles regardless of admin status; everyone edits their own
- **Invite flows** — a per-person targeted invite link (instant claim, no review needed) and a shared family-wide join link (claims require admin approval, since a shared link can't be pre-vetted)
- **Privacy statement page**, linked from every entry point
- **Mobile-first fixes** — touch targets, dialog scrolling, directory toolbar layout, bottom-nav positioning, all specifically audited for a mobile-heavy, less tech-savvy audience
- **Self-serve account deletion** — a confirmation-gated "Delete Account" option in Settings, available to every user; deleting the last person in a family unit automatically cleans up the now-empty family too

## Features (Explicitly Deprioritized, Not Missing by Accident)
- Family tree visualization polish (`tree.tsx`) — functional but not actively improved
- Photo-per-life-event
- SMS notifications
- Payment infrastructure — see [Business Model](#business-model--open-question) below

## Under Discussion / Not Yet Built

See `PROGRESS.md` for the live, detailed list. Headlines:
- **"Memories of those who've passed" feature** — a new major direction raised by the product supervisor: turning Olive into a place where multiple relatives contribute memories of a deceased family member, prompted via low-friction email (not app-only), leaning on Olive's existing family graph to make prompts relationship-aware. Brainstorm stage only as of 2026-07-13 — see `PROGRESS.md` for the full writeup.
- Printable/PDF family directory export (recently bumped to higher priority)
- Profile completeness indicators, geographic map of family members, Ancestry.com import, and more — full list in `PROGRESS.md`

## Business Model — Open Question
No payment structure has been chosen yet. Under consideration: a grandparent-pays subscription, a cost-split-by-family-size subscription, or an ad-supported free model. This is intentionally not blocking current feature work, but is kept in mind whenever account/billing-adjacent decisions come up.

---

## Architecture (Quick Orientation)

Olive is a **pnpm monorepo**:

| Path | What it is |
|---|---|
| `artifacts/api-server` | Express backend, bundled by esbuild to a single Vercel serverless function |
| `artifacts/family-branch` | React + Vite single-page app (the actual UI) |
| `lib/db` | Drizzle ORM schema, DB connection, and the family-relationship graph data layer |
| `lib/api-zod` | Zod request-validation schemas (generated by orval) |
| `lib/api-client-react` | React Query hooks for the frontend (generated by orval) |
| `lib/api-spec` | OpenAPI spec — source of truth for the generated packages above (though it has some known drift, see `security.md`) |

**Stack:** Vercel (hosting + serverless functions + cron), Supabase (Postgres), Drizzle ORM, Express, React, Vite, React Query, Tailwind, Resend (email), OpenAI (AI chat).

**For the non-negotiable engineering rules** (edge-direction conventions, why two "person" tables exist, build-command constraints, etc.), see `CLAUDE.md` — every coding session against this repo is expected to follow it exactly.

**For deep historical technical detail** (exact schema history, past architecture decisions, and how the relationship graph was originally built), see `HANDOFF.md` — note it was last generated 2026-05-26 and is **not fully current** (e.g. it predates multi-admin, life events, the AI chat expansion, and describes a CLI-based deploy flow that's since moved to git-push-based deploys). Treat it as historical background, not current state.

**For current security posture**, see `security.md` — a living audit of secrets handling, auth, injection safety, and more, checked against the real code (not generic advice). Meant to be re-run periodically, not a one-time pass.

**For the live task list and everything currently in flight**, see `PROGRESS.md`.
