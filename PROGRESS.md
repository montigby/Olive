# Olive — Progress Tracker

This is the living task list for Olive. Keep it current: check items off as they ship, add new items as they come up, and don't let this drift from reality — if in doubt, verify against `git status`/`git log` rather than trusting a stale line here. See `README.md` for what the project is, `CLAUDE.md` for engineering rules, `security.md` for the security posture.

Last updated: 2026-07-21.

---

## 🔴 START HERE — pick up from this point next session

**Vercel account access was restored 2026-07-21** (see `vercel_account_access.md` memory — the GitHub/email account-conflict blocker from 2026-07-20 is resolved). This unblocks everything below that was previously stuck on dashboard access.

**One thing to confirm first, if not already done:** commit `32bc868` (the dependency security-patch commit, last one pushed 2026-07-21) needs a manual check in the Vercel dashboard's Deployments tab to confirm it actually **built successfully** — a healthy `/api/healthz` only proves the *previous* successful deploy is still serving traffic, not that this one built. Local verification was typecheck + `pnpm audit` only; the real esbuild build couldn't run locally (pre-existing Windows-only gap, see `local_dev_environment.md` memory) so this is the one blind spot from that session.

**Then run the manual smoke test** the user was given at the end of the 2026-07-21 session (not yet confirmed done): log in, open the family tree page (both as admin and, if available, a non-admin/linked-unit viewer), add a member, generate an invite link for them, toggle Settings → Member Permissions, check a profile page's visibility tiers look right, and add a memory with a photo. All of today's fixes were *additive* restrictions, so the failure mode to watch for is a legitimate action now wrongly 403ing — not a security hole reopening.

**2026-07-21 was a huge session — full recap:**
1. Memories-of-the-deceased feature (built 2026-07-20) — deploy now confirmable, but the actual end-to-end manual verification (mark deceased → opt in → add memory → confirm prompt email + tier targeting) still hasn't been done. See section below.
2. **Fixed a `photoUrls` tracking-pixel gap** on memories (`8b9511a`).
3. **Fixed the acute `openapi.yaml` drift** — Person/FamilyUnit/UnitSummary/BirthdayEntry schemas + the account-merge endpoints were undocumented, risking a silent breakage on the next `orval codegen` (`7899363`). Life-events/memories/home-feed/AI-chat/join-flow endpoints are *still* undocumented but that's lower-risk (never had spec backing to begin with) — see `openapi_drift.md` memory for the exact list if this gets picked back up.
4. **Fixed a latent `parentPersonId` PATCH no-op bug** (`c7c90bd`).
5. **Full route-level access-control audit — 6 real broken-access-control bugs found and fixed**, the most serious work of the session: a cross-family PII leak on `GET /family-units/:unitId/tree` (any logged-in user could pull any other family's full member tree), an account-takeover path via the member-invite endpoint, cross-family member/unit tampering, and a link-request consent bypass. **See the new CLAUDE.md rule #7** — `requireAdmin` doesn't check unit ownership, this is the bug class to watch for on any new `:unitId` route. Full detail in `security.md` and the `security_audit.md` memory. All deployed and live-verified via unauthenticated probes against `https://myolive.app` (not full manual QA — see smoke test above).
6. Also fixed: CORS preflight 500s, a `membersCanInvite` validation bypass, a cross-family relationship-injection + missing password floor in the public claim flow.
7. **First-ever `pnpm audit` run**, then **patched the 4 CVEs that actually sit on `api-server`'s production dependency chain** (`path-to-regexp`, `qs`, `body-parser`, `form-data`) via `pnpm-workspace.yaml` overrides (`32bc868`). 23 advisories remain but are all dev/build-tooling-only (orval, vite, vitest) — never deployed, not urgent.
8. Structural review of `lib/visibility.ts` (clean, no new bugs) and a frontend XSS/injection pass (clean — the one `dangerouslySetInnerHTML` in the codebase is dead code, unused anywhere).

**Not done / open follow-ups from today:**
- [ ] Confirm `32bc868` deployed successfully (see above)
- [ ] Manual smoke test (see above)
- [ ] Manual end-to-end verification of the memories feature itself (see section below — separate from the access-control fixes)
- [ ] The 23 remaining `pnpm audit` advisories (dev-tooling only, low urgency)
- [ ] OpenAPI Phase 2 — document the still-undocumented endpoint groups (life-events, memories, home-feed, ai-chat, the whole join/claim invite-token system) — see `openapi_drift.md` memory

---

## 🟡 Memories of the Deceased — BUILT 2026-07-20, Vercel access restored 2026-07-21, still not manually verified end-to-end

Full feature scoped via direct interview with the user (now personally driving this feature, not the supervisor) and built same-day. Deceased flag + date of passing on a profile, opt-in memory collection (any family member can start it, admin-only to stop), memories with text + up to 3 photos, publish-as-submitted with contributor edit / contributor-or-admin delete, a 45-prompt bank across 6 categories that rotates and avoids repeats for years, a daily cron that targets close relatives via the existing tier/graph system (not a blanket send) and emails prompts through Resend, an AI chat tool for adding memories conversationally, auto-logged life event + birthday-reminder exclusion when someone is marked deceased.

**Two scope calls made during the build**, worth knowing about:
- Prompt emails deep-link into the app instead of true reply-to-email — every realistic contributor already has an Olive login, so this gets the same low friction without needing Resend's inbound-email/DNS setup. True reply-to-email can be added later as an alternate path.
- Skipped orval/openapi codegen for the new endpoints, hand-writing `fetch` calls instead (same precedent as life-events). Along the way, found `lib/api-spec/openapi.yaml` had already drifted significantly out of sync with the real API before this session touched it (missing fields like `venmo`/`snapchat`/`bereal` on Person, `birthdayCount`/`phoneCount` on UnitSummary, and an entire account-merge type set) — not fixed, just avoided disturbing it further.

**Status as of 2026-07-21:**
- [x] Migration `0015_memories.sql` applied via Supabase SQL editor — ran "without RLS" (correct choice: this app has no RLS anywhere, access control is entirely in the Express JWT layer, not Postgres) — confirmed success
- [x] **Vercel account access restored 2026-07-21** — the GitHub/email account-conflict is resolved, dashboard is reachable again.
- [x] Deploy confirmed live indirectly — live probes against `https://myolive.app/api/cron/memory-prompts` on 2026-07-21 returned a 401 (auth-gated, not 404), proving the route exists in production, so `eb965c4`/`f7f04fe`/`73e7367` did deploy at some point. Not confirmed via the dashboard directly.
- [ ] Confirm the `/api/cron/memory-prompts` Vercel cron job is within plan limits (2nd cron job added alongside `birthday-emails` in `vercel.json`) — now checkable via the dashboard, just hasn't been done yet
- [ ] Manual end-to-end verification on production: mark someone deceased, opt in, add a memory, confirm a prompt email actually sends and the tier-based targeting looks right for a real family

Full spec: memory file `legacy_memories_feature.md` (auto-memory system).

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

Nothing currently open here — the "memories of those who've passed" feature that lived in this section moved to "Built, Not Yet Live" above once it was scoped and implemented (2026-07-20).

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
- [ ] Memory book PDF export — deliberately deferred out of the memories-of-the-deceased v1 (see above); revisit alongside the business model decision once that feature is live and it's clear whether it's actually getting used

### Already Shipped, Listed Here for Completeness (don't re-propose these)
Directory search, Google Calendar/iCal button (Birthdays page only), Venmo & social links, public landing page (direct self-serve "Create Directory" CTA, waitlist framing removed 2026-07-20, olive/gold palette applied site-wide), life events CRUD, birthday email notifications, multi-admin + layered permissions, privacy statement page, per-handle social visibility toggles, profile completeness indicator *(shipped but deliberately self-view-only, confirmed 2026-07-13 — not expanding scope)*, viewer-relative relationship labels, gendered relationship labels, admin-grant confirmation + Admins settings card, printable/PDF family directory export, mobile UI audit (full punch list, see below).

---

## Business Model
Still undecided as of 2026-06-26: grandparent-pays subscription vs. split-by-family-size subscription vs. ad-supported. Not blocking current feature work. Revisit whenever account/billing-adjacent features come up (e.g. the memory-book export idea above).

---

## Recurring Maintenance (don't let these slip)
- [x] Re-run the `security.md` audit — done 2026-07-21, and turned into the biggest fix batch of the project so far (6 broken-access-control bugs). Re-run again before onboarding any real families beyond testing, and any time auth/payments/new personal-data fields are touched.
- [ ] The 23 remaining `pnpm audit` advisories (dev-tooling only — orval/vite/vitest, never deployed) — not urgent, revisit if `pnpm audit` is ever wired into CI
- [ ] Periodically check actual Resend usage/plan against limits in the Resend dashboard as the family/user base grows (current volume is nowhere near any tier's cap as of 2026-07-13)
- [ ] Keep `HANDOFF.md` in mind as historical-only — it's stale (dated 2026-05-26) and shouldn't be trusted for current architecture without cross-checking

---

## Recently Shipped (Condensed Changelog)
For full detail, `git log` is authoritative. Highlights, most recent first:
- **2026-07-21 security sweep** (see "START HERE" at the top for full detail) — 6 broken-access-control bugs across `members.ts`/`linkRequests.ts`/`familyUnits.ts`, memories photoUrls tracking-pixel gap, CORS 500s, `membersCanInvite` validation bypass, `parentPersonId` PATCH no-op, acute `openapi.yaml` drift, 4 dependency CVEs patched — `8b9511a`, `7899363`, `c7c90bd`, `152d09f`, `c6b1060`, `1e94fa3`, `e6927d5`, `b5bb35a`, `4d03985`, `9c9c1a6`, `cbd5e43`, `32bc868`
- Memories-of-the-deceased feature built (2026-07-20) — see "Built, Not Yet Live" section above for full scope and outstanding steps — `eb965c4`, `f7f04fe`
- Landing page waitlist CTA replaced with direct self-serve "Create Directory" signup (2026-07-20) — the waitlist framing was a mistake, not the actual goal — `595e582`
- Mobile bottom tab bar lowered further, second pass (2026-07-20) — `1fa4f09`
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
