# Olive — Progress Tracker

This is the living task list for Olive. Keep it current: check items off as they ship, add new items as they come up, and don't let this drift from reality — if in doubt, verify against `git status`/`git log` rather than trusting a stale line here. See `README.md` for what the project is, `CLAUDE.md` for engineering rules, `security.md` for the security posture.

Last updated: 2026-07-27.

---

## 🔴 START HERE — pick up from this point next session

**Niece/Nephew/In-law relative picker shipped (2026-07-27, commit `4541eeb`)** — closes backlog item #26 in `suggestions_shortlist.md`. The Add Family Member dialog's "which relative" picker previously only appeared for Grandson/Granddaughter (`isGrandchildRole`); anyone added as Niece/Nephew, or via the old generic "In-Law" catch-all option, became a graph orphan even though `syncPersonToRelationshipLayer` (`artifacts/api-server/src/lib/syncRelationship.ts`) already had edge logic for those roles — it just never received a `parentPersonId` from this dialog to use. Fixed by:
- Replacing the generic "In-Law" option with specific **Brother-in-law**/**Sister-in-law** entries, matching what the AI chat path already produces (the generic label could never match the backend's exact-string branch).
- Extending the picker to **Niece/Nephew** (candidates: Brother/Sister + their in-law spouses, label "Child of") and **Brother-in-law/Sister-in-law** (candidates: Brother/Sister, label "Married to" since it's a spouse pick not a parent pick).
- Always resetting the picker selection on role change, since the valid candidate list differs per role.

**Live-verified end-to-end (not just typechecked)** against a throwaway test family (`smithjac007+relpicker@gmail.com`, since deleted via self-serve delete): added a Brother, then a Niece "child of" him, then a Sister-in-law "married to" him, and confirmed via a direct `GET /family-units/:unitId/relationships` call (now itself documented, see below) that the real edges landed correctly — `Nia --biological_parent--> Sam`, and the symmetric `Mia <--spouse--> Sam` pair. Confirms the fix works at the data layer, not just the UI.

**OpenAPI Phase 2 documentation shipped (2026-07-27, commit `968bb80`)** — closes the Phase 2 half of `openapi_drift.md`. Hand-patched `lib/api-spec/openapi.yaml` to document all 8 previously-undocumented endpoint groups that existed and worked in production but never had spec backing: life-events (4), memories (6), `GET .../home-feed`, `POST /ai/chat`, the full invite-token/join/claims system (9), `POST /auth/change-password`, `PATCH /persons/:id/admin`, and `GET .../relationships` (this last one actually lives in `members.ts`, not `familyUnits.ts` as originally assumed). No `orval codegen` run and no generated client files touched, per the established precedent (a full regen previously pulled in ~650 unrelated lines at once). Independently re-verified after a background agent did the work: YAML parses cleanly, all 200 `$ref`s resolve, all 10 pre-existing schemas still intact.

**Self-serve account deletion shipped (2026-07-25)** — closes backlog item (formerly #27 in `suggestions_shortlist.md`). `DELETE /api/persons/:personId` already allowed self-delete on the backend but had no UI; added a low-key, typed-confirmation-gated "Delete Account" card to Settings (`artifacts/family-branch/src/pages/settings.tsx`, visible to every user, deliberately placed last on the page so it's findable if you're looking but not something you'd hit by accident). Deleting the last person left in a family unit now also hard-deletes the now-empty `family_units` row (only possible when that person was the unit's sole admin, so it never fires while anyone else's data is at stake). Commits `7b3c5a2`, `3d510aa` (a real bug caught via live testing — the pre-existing last-admin guard blocked a sole admin from deleting themselves at all, which was exactly the scenario this needed to handle; fixed by exempting the sole-remaining-member case).

Also shipped: `DELETE /api/admin/family-units/:unitId`, an `ADMIN_SECRET`-gated cleanup tool (commit `a6084ec`, same pattern as the existing `backfill-people` admin endpoint) for orphaned/test family units that self-delete can't reach — not a user-facing feature, no button anywhere in the app for it. Built specifically for the 2026-07-24 "Email Delivery Test Family" orphan below, but that cleanup was never actually run: its login credentials were never given to the user in the first place (created and used only within that prior session), so there's no way to self-delete it, and the user decided rotating `ADMIN_SECRET` (Vercel's "Sensitive" flag permanently hides the value once saved — there was no way to retrieve the original) wasn't worth it for one harmless empty row. **Left in place, deliberately skipped, not urgent** — the tool is available for next time a real orphan like this needs cleanup.

**Email delivery confirmed live (2026-07-24)** — closes the last open item from the 2026-07-21/22 smoke test below. Verified via a fully isolated throwaway test family (registered fresh via `/register`, never touched real family data): added one unclaimed test person, generated a shared `/join` link, submitted a claim against it from a second email alias, and confirmed the resulting admin-notification email (`sendClaimPendingNotification`) landed in a real inbox within seconds — correct subject, body, and sender (`notifications@myolive.app`). While checking the inbox, also spotted two real production emails that had already landed previously without anyone confirming it: a day-before birthday reminder (`sendDayBeforeReminder`) and a weekly digest (`sendWeeklyDigest`). That leaves only `sendMemoryPrompt` unconfirmed by direct observation — same Resend client/domain as the other three (low risk), just not yet literally seen firing, since no real deceased+memory-collecting profile currently exists.

**Real bug found + fixed during cleanup (commit `11a4e93`, deployed and verified live)**: clicking "Reject" on a pending claim in Settings has been throwing an Internal Server Error since the claim-approval flow shipped. The frontend never sends a `reason`, so `to_jsonb(NULL::text)` evaluates to SQL `NULL`, which makes the whole `jsonb_set(...)` expression `NULL` and violates `claimer_signal`'s `NOT NULL` constraint on every reject — meaning **every admin's "Reject" click has been silently failing in production** (claim stays pending, admin sees a generic error toast). Fixed by coalescing to a JSON `null` literal before the `jsonb_set` call (`artifacts/api-server/src/routes/inviteFlow.ts`). Confirmed fixed live — rejected the test claim successfully post-deploy.

**The manual smoke test (originally flagged 2026-07-21) is done** — run live via `claude-in-chrome` against production through `d818419`: logged in as admin (Jackson), added a family member, generated a per-person invite link, toggled Settings → Member Permissions on/off, marked a person deceased → opted into memory collection → added a memory with a photo (full end-to-end), then repeated a visibility pass logged in as a real non-admin (Zachary) — Directory/Settings/profile-tier restrictions all confirmed correct. Test person deleted afterward via the AI chat delete flow (worked correctly, asked for confirmation first). One thing still not covered:
- **The "shut out entirely" cross-unit visibility tier** — this family unit only has 9 directly-related members (parents/siblings/grandmother), so there's no linked second family unit in the test data to verify a viewer from a *different* linked family gets fully blocked. Would need a second linked family-unit account.

**Two bugs found during the smoke test:**
1. **FIXED & SHIPPED (`d818419`)** — a person added via "Add Family Member" with a relationship type like Niece/Nephew/Grandchild/In-law displayed as generic "Family member" everywhere (Directory, own profile) instead of their actually-selected relationship, even though the data was saved correctly. Root cause: `syncPersonToRelationshipLayer` needs a `parentPersonId` to create a graph edge for these relationship types, but the Add Family Member dialog never collects one, so the person becomes a graph orphan and `describeRelationship()` had no path to compute from. Fixed by falling back to the person's own stored `relationshipLabel` instead of the generic string. **Deeper root cause intentionally NOT fixed** — see the new backlog item in `suggestions_shortlist.md` (memory) — user explicitly wants this revisited since the target audience (grandparents building a full extended-family directory) will realistically add a lot of people this way, not just direct parents/siblings/children.
2. **Probably not a real bug, just noise from browser automation**: the "Date of passing" field (native `<input type="date">`, no custom JS) appeared to jam typed digits into the wrong segment when driven via `claude-in-chrome`'s synthetic keystrokes. Checked the code — it's a completely vanilla native date input, no custom key handling anywhere in the shared `Input` component — so this is most likely a CDP/synthetic-keyboard quirk with native date inputs specifically, not something a real user typing normally would hit. Didn't "fix" it since there's nothing to fix in the code; flagging here so a future session doesn't waste time re-chasing it, but a genuine live (non-automated) check would be the way to fully rule it out if it ever gets reported by a real user.

**Family Tree page bug — confirmed worse than previously logged, but deliberately set aside** (user's call, tree is a deprioritized feature): beyond the known duplicate-Rhonda mislabeling, the page now also intermittently hangs the renderer for 30+ seconds and once visibly corrupted the whole app layout (collapsed to a ~300px column) when expanding a collapsed family-group node. Clicking directly on a person node to open their profile still works fine. Not investigated further — revisit only if the tree becomes a priority again.

**New capability worth using for future smoke tests:** Claude now has a Chrome automation tool (`claude-in-chrome` skill) that can drive the user's actual logged-in browser — including authenticated pages like Dashboard/Directory/Birthdays, which local dev can't reach (no `DATABASE_URL` locally), and can log into a second real account when the user switches for it. Real upgrade over "deploy and hope" — caught the relationship-label bug above that typecheck + code review both missed. Reach for it before claiming any UI change is verified live. See `local_dev_environment.md` (memory) for operational gotchas hit along the way (screenshot timeouts needing a retry, native date inputs being unreliable to drive via synthetic typing — use the `form_input` tool to set values directly instead).

## 🟡 2026-07-22 session recap

A long session split across three threads: reviewing an old "build a business" course-material folder for reusable ideas, a round of UI/UX fixes prompted by user screenshots, and using live-browser verification for the first time.

**Shipped (all committed and pushed, `main` through `d818419` — see START HERE above for the relationship-label fix that landed after this list was written):**
- **Terms of Service page** (`terms.tsx`) — the footer link was dead; built to match `privacy.tsx`'s structure/tone, wired into the router and landing footer.
- **Landing page, grandparent-audience fixes** — fixed two real WCAG contrast failures (as low as 2.36:1) on caption/footer text computed by hand; cut two bits of tech jargon ("second brain," "AI Assisted") that read oddly for a non-technical, older audience and risked triggering AI-skepticism before the FAQ's reassurance is even seen. Also fixed a stale FAQ answer claiming the printable directory "isn't built yet" — it already ships (`members.tsx`'s Print button).
- **Add Family Member clarity** — the dashboard button linked to the bare directory page and used a mail/envelope icon that visually implied "send an invite," though the action creates a placeholder profile with no email involved. Now deep-links into the actual add-member dialog (`?add=1`) and uses `UserPlus` to match the Directory page's own button; both relabeled "Add Family Member."
- **Birthday countdown switches to months past ~30 days out** — was showing raw unbounded day counts ("In 218 days") on both the Dashboard widget and the full Birthdays page. New shared `formatDaysUntil()` in `lib/birthday.ts` rounds to the nearest month using an average month length (not floor/ceil), so the 1-vs-2-month switch lands at the true midpoint (~45.5 days) rather than a fixed cutoff — researched against date-fns and GitLab/Primer's relative-time conventions first.
- **Site-wide avatar unification** — new shared `PersonAvatar` component (`components/PersonAvatar.tsx`) replaces ad hoc avatar styling that had three different fallback colors and no consistent size scale across Home/Dashboard/Directory/Birthdays/nav/tree/profile. Sized per Material Design's list/card guidance and WCAG contrast research (bold/larger initials text to clear the "large text" 3:1 threshold, since the brand green at 10% tint sits right at ~4.4:1 for normal text). Found and fixed the actual reason Dashboard and Birthdays never showed real photos: both share one backend endpoint whose response never included `photoUrl` — added it to the route, `openapi.yaml`, and hand-patched the generated type (a full `orval codegen` pulled in ~650 unrelated lines of already-tracked spec drift — see `openapi_drift.md` memory — so was reverted in favor of a surgical patch).
- **Desktop nav padding decoupled from mobile** — the bottom tab bar is only `md:hidden`, so a desktop browser window under 768px wide renders the identical mobile nav; its safe-area-based padding looked cramped without an actual device safe-area. Now uses the `pointer-fine` CSS variant to target input type instead of just viewport width, so real touch devices and narrow desktop windows can be tuned independently.
- **Directory header no longer clips at narrow desktop widths** — the search/sort/print/Add-Family-Member row had no wrap point; added `flex-wrap` so the button drops to its own line instead of running off-screen.
- **Privacy/Terms: scroll-to-top + back-arrow always to landing** — both pages inherited scroll position from whatever page linked to them (landing's footer requires scrolling to the bottom first) and their back arrow used browser history instead of a fixed destination. Fixed with a mount-time `scrollTo(0,0)` **plus** disabling the browser's native `history.scrollRestoration` app-wide (`App.tsx`) — the native behavior was racing the page's own effect on Wouter client-side transitions and winning. This second part was only caught by testing the real click flow in a live browser; a hard page reload alone looked correct and would have shipped the bug.

**Not done / still open:**
- [ ] The 2026-07-21 manual smoke test (see START HERE above)
- [ ] Monetization model decision — researched this session (see `business_model.md` memory), user is leaning freemium but explicitly not committing yet
- [ ] Legal business entity registration — unconfirmed whether this has been done; can't check from the codebase
- [ ] `HANDOFF.md` is stale (dated 2026-05-26) — wasn't touched this session, PROGRESS.md is the reliably-current source

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
Directory search, Google Calendar/iCal button (Birthdays page only), Venmo & social links, public landing page (direct self-serve "Create Directory" CTA, waitlist framing removed 2026-07-20, olive/gold palette applied site-wide), life events CRUD, birthday email notifications, multi-admin + layered permissions, privacy statement page, per-handle social visibility toggles, profile completeness indicator *(shipped but deliberately self-view-only, confirmed 2026-07-13 — not expanding scope)*, viewer-relative relationship labels, gendered relationship labels, admin-grant confirmation + Admins settings card, printable/PDF family directory export, mobile UI audit (full punch list, see below), self-serve account deletion + admin-only orphaned-family-unit cleanup tool (2026-07-25, see START HERE above).

**Deliberately not built as user-facing features (2026-07-25 decision, don't re-propose):** a standalone "delete my whole family" button/flow for admins. Self-delete is the only user-facing deletion entry point; family-unit-level cleanup only happens as an automatic side effect when the last remaining person deletes themselves, or via the internal admin-secret-gated tool for edge cases self-delete can't reach. User's explicit call — see `suggestions_shortlist.md` (memory) item on account deletion for the full reasoning.

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
- **Self-serve account deletion + admin family-unit cleanup tool** (2026-07-25, `7b3c5a2`, `3d510aa`, `a6084ec`) — see START HERE above for full detail, including a real last-admin-guard bug caught via live testing
- **Claim-reject 500 fix + email delivery verification** (2026-07-24, `11a4e93`) — found live while verifying Resend delivery via an isolated test family; see START HERE above for full detail
- **Relationship-label fallback fix** (2026-07-22, `d818419`) — found via live smoke-testing; see START HERE above for full detail
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
