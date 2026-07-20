# Olive — Progress Tracker

This is the living task list for Olive. Keep it current: check items off as they ship, add new items as they come up, and don't let this drift from reality — if in doubt, verify against `git status`/`git log` rather than trusting a stale line here. See `README.md` for what the project is, `CLAUDE.md` for engineering rules, `security.md` for the security posture.

Last updated: 2026-07-18.

---

## ✅ Security Punch List — CLOSED 2026-07-15

All six items from `security.md`'s original audit shipped and verified live (commits `82fee68`, `d7d612c`, `2f1a626`, `34309b7`):

1. [x] `SESSION_SECRET` fails closed at boot (matches the `DATABASE_URL` pattern) — confirmed set in Vercel first.
2. [x] Cron secret bypass fixed — real `Authorization: Bearer <CRON_SECRET>` check, no more spoofable user-agent string.
3. [x] `/api/healthz/db` deleted — was leaking raw DB error internals unauthenticated.
4. [x] CORS restricted to `https://myolive.app` (+ `APP_BASE_URL`, + localhost in dev), `helmet` added for CSP/HSTS/X-Frame-Options. Verified a random origin is rejected and the CSP header doesn't leak onto the SPA's static HTML.
5. [x] Rate limiting added — login capped at 10/10min (IP+email), AI chat capped at 30/15min (personId). Verified the 11th login attempt returns 429.
6. [x] `ADMIN_SECRET` fails closed at boot — **was actually missing from Vercel entirely** (not just a hypothetical gap; admin endpoints were live on the hardcoded `"olive-admin-2026"` fallback until this was fixed). User added a real value to Vercel (Production + Preview), then the code was flipped. Verified live: app boots fine, old fallback now gets 403, real secret still authenticates. Also fixed `.gitignore` to exclude a plain `.env`.

Full writeup: `security.md`. Next security-relevant work is bigger-lift stuff intentionally deferred (session revocation, dependency-audit automation, 2FA) — see `security.md` §2/§7/§8, not urgent at current scale.

---

## ✅ Mobile UI Audit — CLOSED 2026-07-17

All items from the 2026-07-07 audit shipped (commits `6ac4230`, `786b851`):

1. [x] Dashboard's 3 stat cards now stack 1-col on phones instead of crushing into a flat `grid-cols-3`
2. [x] Registration form + Add Member dialog name fields stack on mobile instead of squeezing to ~100px columns
3. [x] Settings unit-code row stacks vertically on mobile
4. [x] Directory-link search input (`link.tsx`) no longer hides typed text behind the Find button
5. [x] Pinch-to-zoom re-enabled (removed `maximum-scale=1` from the viewport meta)
6. [x] AI chat button/panel and the bottom tab bar respect `env(safe-area-inset-bottom)` on notched phones (`viewport-fit=cover` added to the viewport meta so `env()` reports real values on iOS); chat panel also widened to full-width-with-margins on phones so it can't clip on narrow screens
7. [x] Bottom tab bar's padding lowered (flat 2.5rem minimum → 1rem, still floored by the safe-area inset) — was sitting noticeably higher above the true edge than it needed to

Also caught and fixed in the same pass: the landing page's "Log In" link was `hidden` below the `sm:` breakpoint, making it invisible on phones — the primary device for existing families trying to get back in (commit `77ee39c`).

Manual verification on a real notched phone still pending from the user.

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

## 🟢 Open Follow-up

- **CORS allowlist vs. Vercel alias URLs** — the 2026-07-15 CORS restriction (see punch list above) broke login for the user because they were habitually using a Vercel-generated `*.vercel.app` alias URL rather than `https://myolive.app`. Not a bug — that origin was correctly rejected — but worth deciding: keep using `myolive.app` only (current default), or add the stable git-branch-tracking alias (e.g. `<project>-git-main-<team>.vercel.app`) to the CORS allowlist too if that URL gets used again. Not settled.

---

## 🔵 Backlog (Roughly Priority Order)

- [ ] Home page real life-events feed — current "Recent updates" feed isn't sourced from the actual `life_events` table, just inferred activity; not yet discussed whether to wire in real data
- [ ] Invite/claiming flow — the "not listed → create new profile" self-service path inside `/join` is intentionally unreachable in the UI (backend/component code left intact); worth finishing later if ever prioritized
- [ ] Geographic map of family members — not started, no lat/long fields exist yet
- [ ] Ancestry.com import — not started
- [ ] Photo per life event — not started, scoped as last-priority within life events
- [ ] Real photography for the landing page — the hero/problem/CTA image slots are still abstract gradient placeholders (`PhotoPlaceholder` in `landing.tsx`), flagged before any real public push
- [ ] "Learn More" destination under the second-brain section on the landing page was removed 2026-07-15 (had nowhere real to point); revisit if a dedicated "how it works" page or demo ever gets built
- [ ] Set up `privacy@myolive.app` email forwarding (5-minute DNS job) and swap the Privacy page's "contact your admin" copy for a real mailto link — deferred by user, **remind again before onboarding real families beyond testing**
- [ ] Stripe integration — on hold until [Business Model](#business-model) is decided
- [ ] Dependency vulnerability scanning in CI — no CI pipeline exists at all currently (see `security.md` §7)

### Already Shipped, Listed Here for Completeness (don't re-propose these)
Directory search, Google Calendar/iCal button (Birthdays page only), Venmo & social links, public landing page (waitlist framing, olive/gold palette applied site-wide), life events CRUD, birthday email notifications, multi-admin + layered permissions, privacy statement page, per-handle social visibility toggles, profile completeness indicator *(shipped but deliberately self-view-only, confirmed 2026-07-13 — not expanding scope)*, viewer-relative relationship labels, gendered relationship labels, admin-grant confirmation + Admins settings card, printable/PDF family directory export, mobile UI audit (full punch list, see below).

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
- Mobile bottom tab bar lowered — reduced excess bottom padding while still respecting notched-phone safe area — `786b851`
- Mobile landing page "Log In" link fix — was hidden below the `sm:` breakpoint, invisible on phones — `77ee39c`
- Remaining mobile UI audit items closed (dashboard cards, forms, settings row, search input, pinch-to-zoom, safe-area-inset handling) — see Mobile UI Audit section above — `6ac4230`
- Printable/PDF family directory export — "Print Directory" button on the Directory page opens the browser print dialog with a tier-filtered, privacy-safe contact sheet — `02cdea8`
- Production login 500 diagnosed and resolved (2026-07-15) — root cause was a Vercel `*.vercel.app` alias URL not covered by the new CORS allowlist, not an app bug. All temporary diagnostic code added while chasing it was fully reverted afterward (commits `a6b1f44`..`22089a1`); see [[login-incident-2026-07-15]] memory for the full diagnostic writeup.
- Back button added to the Privacy page (`history.back()` w/ fallback) since it's linked from many entry points and only the browser back arrow could return you — `15a3769`
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
