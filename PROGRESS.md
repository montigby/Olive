# Olive — Progress Tracker

This is the living task list for Olive. Keep it current: check items off as they ship, add new items as they come up, and don't let this drift from reality — if in doubt, verify against `git status`/`git log` rather than trusting a stale line here. See `README.md` for what the project is, `CLAUDE.md` for engineering rules, `security.md` for the security posture.

Last updated: 2026-07-15.

---

## 🔴 Right Now — Security Punch List

Ranked by risk × effort. Items 1–5 shipped and verified live 2026-07-15 (commits `82fee68`, `d7d612c`, `2f1a626`); only item 6 remains, blocked on the user adding a real `ADMIN_SECRET` to Vercel.

1. [x] **JWT secret (`SESSION_SECRET`) fail-closed in production** — confirmed set in Vercel Production first, then `auth.ts` now throws at boot if missing, matching the existing `DATABASE_URL` pattern.
2. [x] **Fixed the spoofable cron-secret bypass** — `cron.ts` now checks Vercel's real `Authorization: Bearer <CRON_SECRET>` header (auto-attached to genuine cron requests) instead of a spoofable `user-agent` string.
3. [x] **Deleted `/api/healthz/db`** — dead debug code, was leaking raw DB error internals unauthenticated.
4. [x] **CORS restricted to `https://myolive.app`** (+ `APP_BASE_URL`, + localhost in dev) and **`helmet` added** for baseline security headers. Verified live: a random origin gets rejected, the real origin gets a scoped `Access-Control-Allow-Origin`, CSP/HSTS/X-Frame-Options all present on API responses, and confirmed the CSP header doesn't leak onto the SPA's static HTML (separate routing path).
5. [x] **Rate limiting added** — `/api/auth/login` capped at 10 attempts/10min (keyed by IP+email), `/api/ai/chat` capped at 30 requests/15min (keyed by personId, closes the no-cost-cap gap on OpenAI usage). Verified live: the 11th rapid login attempt returns 429.
6. [ ] **`ADMIN_SECRET` fail-closed** — same treatment as `SESSION_SECRET`, but **`ADMIN_SECRET` is not set in Vercel at all** (checked the dashboard 2026-07-15 — it's missing from the env var list entirely, so admin endpoints are actively running on the hardcoded `"olive-admin-2026"` fallback right now, not just hypothetically). Generated a random replacement value for the user to add to Vercel Production; waiting on confirmation before flipping the code to fail-closed. Also still open: fix `.gitignore` to exclude a plain `.env` (not just `.env*.local`).

Full detail and reasoning for all of the above: `security.md` (punch-list section there still needs updating to match — do that alongside item 6).

---

## 🟡 Active Discussions — Not Yet Scoped/Approved to Build

- **"Memories of those who've passed" feature** — supervisor-proposed new main feature (2026-07-13). Concept: collect memories of deceased family members from multiple living relatives, prompted via low-friction email (reply-to-email style, not app-only), leaning on Olive's existing family graph to make prompts relationship-aware ("a memory of your grandpa" vs "your dad"). Differentiator vs. StoryWorth/Legacy.com/Ancestry: crowd-sourced multi-perspective memories on one profile, not a single-author memoir. Key open questions before this can be scoped:
  - Data model: needs a "deceased" flag + date-of-passing on `persons` (doesn't exist yet), a memories table, and a prompt bank.
  - Whether memories need moderation before appearing, or publish-as-submitted.
  - Interview cadence/trigger timing (death anniversary? slow drip after opt-in?).
  - **Hard requirement already set:** any notification system for this must be tier/relationship-aware (reuse the `computeTier`/`buildFamilyGraph` work), not a blanket send to everyone.
  - Floated monetization angle: a "memory book" PDF export as a premium feature — ties into the printable-directory backlog item below.
  - Pure brainstorm stage — nothing here is approved to build yet.

---

## 🟢 Known Open Bugs

- **Family tree view "very wrong" — NOT YET INVESTIGATED.** User provided a screenshot (2026-07-13) showing a duplicate Rhonda in the Smith family tree (correctly as grandmother at top, incorrectly as a "sister" in the children's row). Likely a `layoutUnit`/`layoutLayeredView` rendering bug in `tree.tsx`, separate from the directory's `describeRelationship` bug already fixed. Deprioritized behind the directory fix, still not looked at.
- **Recent-updates home feed can still mislabel what changed** — it infers "what changed" from current field presence (photo > phone > address > generic), not a real diff. A second edit to an already-filled field can still say "added a photo" if a photo already exists. A proper fix needs real change-tracking (bigger feature, not started).
- **Blank-screen crash after AI-chat delete** — reported once (2026-07-08), root cause never confirmed, hasn't reproduced since despite a deliberate attempt. Mitigated with a root-level React error boundary (shows "Reload" instead of a blank page). Dormant, not fixed.
- **Add Member dialog first-focus keyboard-cover quirk** (mobile) — on-screen keyboard briefly covers the field on first tap, self-corrects on second interaction. Likely a viewport-resize timing issue. Not investigated further, low priority.
- **Rachel/Rhonda "Recent updates" timestamp question** — user flagged two people's activity timestamps as possibly inaccurate (2026-07-10). Traced the display logic, found no bug in it directly; two unconfirmed hypotheses exist (pre-fix no-op save, or "joined" label firing on record-creation vs. actual signup). Deferred by user, not revisited since.
- **Gendered relationship labels not yet confirmed live** — shipped 2026-07-14, backfilled for 66/82 existing people; not yet visually confirmed by the user in the Directory. Every family unit's admin still needs to set their own gender manually (their row's label, "Me", never implied one).

---

## 🔵 Backlog (Roughly Priority Order)

- [ ] Mobile UI audit — remaining cosmetic items: dashboard's 3 stat cards crushed on phones, AI chat panel misalignment/clipping, registration form fields squeeze to ~100px columns, Settings unit-code row doesn't stack, search input text hides behind its own button (`link.tsx`), no safe-area-inset handling for notched phones, pinch-to-zoom cap (`maximum-scale=1`) not yet decided on removal
- [ ] Home page real life-events feed — current "Recent updates" feed isn't sourced from the actual `life_events` table, just inferred activity; not yet discussed whether to wire in real data
- [ ] Invite/claiming flow — the "not listed → create new profile" self-service path inside `/join` is intentionally unreachable in the UI (backend/component code left intact); worth finishing later if ever prioritized
- [ ] Printable/PDF family directory export — recently bumped to higher priority, confirmed not present in the codebase at all
- [ ] Geographic map of family members — not started, no lat/long fields exist yet
- [ ] Ancestry.com import — not started
- [ ] Photo per life event — not started, scoped as last-priority within life events
- [ ] Real photography for the landing page — the hero/problem/CTA image slots are still abstract gradient placeholders (`PhotoPlaceholder` in `landing.tsx`), flagged before any real public push
- [ ] "Learn More" destination under the second-brain section on the landing page was removed 2026-07-15 (had nowhere real to point); revisit if a dedicated "how it works" page or demo ever gets built
- [ ] Set up `privacy@myolive.app` email forwarding (5-minute DNS job) and swap the Privacy page's "contact your admin" copy for a real mailto link — deferred by user, **remind again before onboarding real families beyond testing**
- [ ] Stripe integration — on hold until [Business Model](#business-model) is decided
- [ ] Dependency vulnerability scanning in CI — no CI pipeline exists at all currently (see `security.md` §7)

### Already Shipped, Listed Here for Completeness (don't re-propose these)
Directory search, Google Calendar/iCal button (Birthdays page only), Venmo & social links, public landing page (waitlist framing, olive/gold palette applied site-wide), life events CRUD, birthday email notifications, multi-admin + layered permissions, privacy statement page, per-handle social visibility toggles, profile completeness indicator *(shipped but deliberately self-view-only, confirmed 2026-07-13 — not expanding scope)*, viewer-relative relationship labels, gendered relationship labels, admin-grant confirmation + Admins settings card.

---

## Business Model
Still undecided as of 2026-06-26: grandparent-pays subscription vs. split-by-family-size subscription vs. ad-supported. Not blocking current feature work. Revisit whenever account/billing-adjacent features come up (e.g. the memory-book export idea above).

---

## Recurring Maintenance (don't let these slip)
- [ ] Re-run the `security.md` audit before onboarding any real families beyond testing, and any time auth/payments/new personal-data fields are touched
- [ ] Periodically check actual Resend usage/plan against limits in the Resend dashboard as the family/user base grows (current volume is nowhere near any tier's cap as of 2026-07-13)
- [ ] Keep `HANDOFF.md` in mind as historical-only — it's stale (dated 2026-05-26) and shouldn't be trusted for current architecture without cross-checking

---

## Recently Shipped (Condensed Changelog)
For full detail, `git log` is authoritative. Highlights, most recent first:
- Landing page olive/gold palette applied site-wide; copy rewrite to cut AI-sounding patterns; testimonials/AI-section/CTA cleanup — `f76eec9`
- Waitlist landing page per supervisor's PRD — `954d928`
- Gender field + gendered relationship labels — `4039e7f`
- Viewer-relative relationship label bug fix (siblings/grandparents mislabeled) — `b8f6eb4`
- Layered admin-safety guardrails + Admins management UI — `230ef60`
- Viewer-relative relationship labels; Tier-N jargon dropped from privacy copy — `d6a036c`
- Layered permission model (parents can edit their kids' profiles) — `eadb8b6`
- Mobile bottom-nav raised off viewport edge (link-preview fix) — `4fc4415`
- Privacy statement page, linked from all entry points — `8027fee`
- Recent-updates feed no longer polluted by admin-toggle/no-op edits — `621100c`
- Multi-admin support (grant/revoke) — `a9029e2`
- Non-admin invite sharing controls, AI chat expanded to update/delete + life events, mobile touch-target/dialog/toolbar fixes, birthday wish button, add-to-calendar button, life events full CRUD, birthday email notifications — various commits, 2026-07-01 through 2026-07-08
