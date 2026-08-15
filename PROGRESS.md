# Olive — Progress Tracker

This is the living task list for Olive. Keep it current: check items off as they ship, add new items as they come up, and don't let this drift from reality — if in doubt, verify against `git status`/`git log` rather than trusting a stale line here. See `README.md` for what the project is, `CLAUDE.md` for engineering rules, `security.md` for the security posture.

Last updated: 2026-08-15.

---

## 🔴 START HERE — pick up from this point next session

**2026-08-15 session summary (commits `79dade2` through `b4de524`) — large single-day session, paused mid-flight on usage limits, 2 background agents still unreviewed:**

Started from a duplicate/orphaned "Smith Family" the user spotted via a self-run SQL query (root cause: a historical, now-closed admin-grant loophole that let a person with `is_admin: true` but no real account fool the "never zero admins" guard — cleanup SQL handed to the user directly, no agent has DB access to do this itself). That investigation expanded into a full account-recovery and non-traditional-family-support push:

1. **Password reset** (`79dade2`) — no account-recovery path existed anywhere before this; magic-token flow mirroring the invite-token pattern. Migration `0016_password_reset_tokens.sql` still needs a manual Supabase SQL editor run.
2. **Login-overwrite guard** (`2d0de4a`) — `login()` now confirms before silently switching accounts in the same browser, following a researched recommendation against building full multi-account support (no comparable product solves this at the app layer either).
3. **Grandchild-visibility bug** (`b69305c`) — a grandchild added with no resolvable parent was getting wired as the admin's direct child (wrong label, wrong privacy tier), found by a background "break it" testing agent's second attempt (its first attempt stalled and failed without confirming cleanup).
4. **Step/half relationships + a direct divorce action** (`28ec810`) — stepparent/stepchild/step-sibling/half-sibling labels were accepted everywhere but created no real relationship-graph edges (same bug class already fixed for niece/nephew/grandchild/in-laws, just never extended here); also added a `mark_divorced` AI chat tool since `ex_spouse` only auto-created as a side effect of adding a replacement spouse.
5. **Memories surfaced in the Home feed** (`cb727cf`) — the memories-of-the-deceased feature had zero discovery surface outside a specific deceased person's own profile page; now shows as a third signal in "Recent updates".
6. **Aunt/uncle graph corruption** (`38dec63`) + **a related spouse-edge-retirement bug** (`0683509`) — live-diagnosed root cause of relatives showing generic "Extended family" instead of their real label: an ambiguous `parentPersonId` reference was getting silently treated as "spouse", in one case wiring someone as married to their own sister. The retirement bug (found while investigating this) meant divorcing/remarrying only cleared one direction of the symmetric spouse-edge pair.
7. **Landing page Memories section** (`b4de524`) — the feature was a stated main differentiator with zero landing-page mention; added a dedicated section after 3 rounds of direct user copy revision (cut em-dashes/AI cadence, cut structural padding).
8. **AI chat test-drive finally ran clean** on its 4th attempt (own throwaway test family, not the real one — the first 3 attempts were blocked by browser session state). Confirmed step/divorce/half-sibling handling works well conversationally. Found two more real things: the Extended-family bug above (now fixed), and a "side facts get silently dropped" gap (an age or interest mentioned alongside a name+birthday just vanishes, no acknowledgment) — motivated item 9 below.

**Two background agents were still running, unreviewed and unmerged, when the session paused:**
- [ ] Age/notes storage fix (agentId `a44331833abe13821`) — compute a real birth year when an age is mentioned alongside a birthday instead of using the 2000 placeholder; add a real `notes` field so freeform facts like "loves soccer" have somewhere to go instead of disappearing.
- [ ] Non-blocking email verification (agentId `a2a6a02506e335cb0`) — confirmed as the right *permanent* design for this product (not just a testing convenience) given its frictionless-onboarding priority for a non-technical, older audience. Must never gate account usage on verification status.

Check for their completion notifications before assuming either is done; if starting fresh, `git worktree list` will show if either worktree still exists with real work in it. See `next_session_todo.md` (memory) for full detail on both plus the still-open orphaned-test-family SQL cleanup (given directly to the user, not yet confirmed run).

---

**2026-08-14 session summary (commits `0881806` through `6d8650a`) — three open threads, see bottom of this section:**

1. **Weeks 2-3 backlog fully closed.** Profile completeness indicators (`0881806`, field-name bug fix `1ba3d96`) — then the Directory-card badge specifically was removed per direct user feedback (`473e3db`, "please get rid of it"), keeping only the individual-profile-page version. Home-page life events feed wired to the real `life_events` table instead of a field-presence guess (`fa863a6`). Per-field social visibility (item #8) turned out to already be fully built — live-confirmed in the real profile edit form, no code change needed, just a stale backlog note corrected.
2. **Legacy memories feature re-checked against its full original spec**, at the user's explicit request ("have we tackled everything the supervisor asked for?"). Core mechanics all solid and live. **Two real gaps confirmed still open**: reply-to-email was the spec'd primary contribution channel (chosen for the 60+ demographic's app-literacy risk) but the build deviated to deep-link-only; and no one-click no-login unsubscribe exists (only a "turn it off from the profile page" text pointer). Neither is scheduled yet — see memory `legacy_memories_feature.md`.
3. **Security/stability audit pass** (`6d8650a`) — background-agent audit re-confirmed the 2026-07-21 `requireAdmin`-without-unit-check bug class is still fully closed everywhere, and found 5 new real issues, all fixed: a tier-2 viewer contact-info leak (was getting both phone AND email regardless of the target's own `tier2ContactField` choice — same bug class as the old birth-year leak), no server-side length cap anywhere on free-text fields (added across every write path including two unauthenticated endpoints), a life-event notes cap bypassable via PATCH, cross-family `parentPersonId` injection risk, and AI chat's `add_family_member` missing the admin check the REST route has. **Behavior change**: non-admins can no longer add family members via AI chat (previously any authenticated member could). Full detail in `security_audit.md` memory.
4. **Transactional emails redesigned** (`beab4db`) — all 5 Resend email types (birthday day-before/own-birthday/weekly-digest, claim-pending, memory-prompt) were plain unstyled HTML; rebuilt with real brand colors/serif heading/button CTAs/card layout, researched against how comparable products format reminder emails. Kept the existing plain non-marketing copy voice. Also fixed a real gap: the day-before reminder never linked to the birthday person's profile despite having the ID. Verified via local headless-browser screenshots, not yet a real Gmail send.

**Three open threads for next session (see `next_session_todo.md` memory for full detail):**
- [ ] AI chat test-drive — deferred because a background agent's throwaway login collided with the real session in the shared browser (see `local_dev_environment.md`'s new gotcha). Needs the user to re-log into Smith Family first.
- [ ] Research task, explicitly not started yet: should Olive support multiple accounts logged in at once on one device? Check what comparable products do AND whether it'd be worth building independent of that.
- [ ] A second background "break it" live-testing agent was asked to wrap up early, then **stalled and failed** before confirming cleanup — its throwaway test family **"OliveTest Audit" is likely still sitting in production, uncleaned**. Check for and delete it next session (see `next_session_todo.md` memory for the exact steps) before assuming this is resolved.

**2026-08-13 session summary (commits `df6e936`, `a6a0e4c`):**
1. **Footer "Contact" mailto replaced with a copy/open popover** (`df6e936`) — a bare `mailto:` link was instantly handing visitors off to their OS mail client with no warning (and doing nothing useful for anyone without a default mail app). Now shows the address as selectable text with copy + mailto affordances. Live-verified on production, including the copy-to-clipboard toast.
2. **Relative-picker extended to cousin, great-grandchild, and mother/father-in-law** (`a6a0e4c`) — closes `suggestions_shortlist.md` item #26's remaining scope. The mother/father-in-law case needed a reversed edge direction from every other picker case (new person is the PARENT of the selected member, not the child) since it's the one relationship type where the new person outranks the existing one in the tree.
3. **Found and closed a live AI-chat-only bug while in that file:** the AI chat system prompt already promised graph edges for uncle/aunt, grandparent-from-parent, great-grandparent-from-grandparent, nephew-in-law/niece-in-law, and cousin-in-law, but the backend never implemented any of them — anyone added via AI chat with those phrasings silently became a graph orphan. The uncle/aunt case is genuinely ambiguous by label alone (reused for both a grandparent's child and an existing uncle/aunt's spouse); disambiguated by looking up the referenced person's own stored label.
4. **All of the above live-verified end-to-end** via a throwaway test family (registered, exercised through both the real UI dialog and real AI chat messages, checked against the actual `GET /relationships` API response — not just UI display — then fully self-deleted, no debris left). Every edge direction came back exactly as designed, including the trickiest case (uncle/aunt disambiguation split correctly into a parent-edge branch and a spouse-edge branch).

**Next session: ask the user for these before doing anything else — nothing else in the code backlog is blocked on Claude right now.**
- [ ] **Action:** swap `terms.tsx`/`privacy.tsx`'s "contact your admin" copy for a real `privacy@myolive.app` mailto link now that forwarding is confirmed live (see 2026-08-12 below) — `privacy.tsx` also has a dangling "contact us below" line with nothing below it.
- [ ] **Decision:** wire the home page's "Recent updates" feed to the real `life_events` table (currently inferred from field-presence), and/or build real change-tracking so edits stop being mislabeled? Both are unapproved product-scope items, not unfinished code — don't build without a green light.

**2026-08-12 session summary (commit `6944d42`):**
1. **`privacy@myolive.app` forwarding is now LIVE.** Free ImprovMX account created, forwarding `privacy@myolive.app` → the user's own Gmail (`smithjac007@gmail.com`) for now, with an explicit plan to hand off the destination to the supervisor's email later — swapping the ImprovMX alias's destination address is a 10-second change with zero DNS impact, so this hand-off is cheap whenever it happens. Wildcard catch-all alias ImprovMX creates by default was deleted (would've forwarded every misspelled/spam address at the domain, not just `privacy@`). DNS records added directly in Vercel (`myolive.app` is Vercel-hosted, no registrar needed): 2 MX records + 1 SPF TXT record (ImprovMX-provided), plus a `_dmarc` TXT record (`v=DMARC1; p=none; rua=mailto:privacy@myolive.app`) added proactively after the first test email landed in spam — new domains with no DMARC record are a strong spam signal.
2. **Reply-as-privacy@ deliberately left unfinished, by user choice.** Replying to a forwarded email currently sends from the user's personal Gmail address instead of `privacy@myolive.app`, since Gmail only lets you send *as* an address you've verified via SMTP. ImprovMX's own SMTP relay requires a $9/mo Premium plan (declined, per spend rule); the free workaround (Gmail's own `smtp.gmail.com` relay + an App Password) hit a wall — the user's Google account doesn't have 2-Step Verification enabled, which App Passwords require. User explicitly decided not to enable 2FA to unblock this, since `privacy@` will rarely if ever need a reply. **Not a bug, don't re-propose fixing it without being asked** — revisit only if the user brings it up again.
3. **Birthday emails personalized for the birthday person themselves** (`6944d42`) — the day-before reminder cron sent the birthday person the same "X has a birthday, reach out!" copy meant for other family members; now they get a distinct heads-up email instead.
- [ ] **Action:** confirm legal business entity registration status — unknown, not checkable from the codebase.
- [ ] **Action:** real landing-page photography — hero/problem/CTA sections still use placeholder gradients (hero's is now a `HeroMockup` in-app-screenshot style visual as of 2026-08-07, not a gradient; problem/CTA are still plain gradients).
- [ ] **Decision:** business model — still parked. Freemium/per-household lean exists (`business_model.md`) but not committed. Don't build billing infra until this is decided.

**2026-08-07 session summary (commits `ad8cdea`/`3007a4f` merge, `db3f437`/`d912195` merge):**

**2026-08-07 session summary (commits `ad8cdea`/`3007a4f` merge, `db3f437`/`d912195` merge):**
1. **`persons.photoUrl` tracking-pixel gap closed.** Same base64-data-URI restriction already on `memories.photoUrls` now applied to `persons.photoUrl`'s one write chokepoint (`personUpdate.ts`'s `buildPersonUpdateData`). Built in an isolated worktree by a background agent, diff reviewed before merge. See `security.md`/`security_audit.md` memory.
2. **Landing page: full competitive comparison + 7 fixes shipped.** Researched against Storyworth/Cozi/Tinybeans/FamilyWall/MyHeritage/Notion/Linear (background agent, fetched live sites). Implemented: dropped reintroduced "AI Reminders" jargon → "Reminders"; fixed a nav/heading casing mismatch; trimmed the hero subheadline to one declarative sentence; de-italicized testimonial quotes (readability for the audience); merged two redundant feature-list sections into one; replaced the hero's gradient placeholder with a `HeroMockup` (reuses the existing `PhoneMockup` pattern, no real photography needed); hid (didn't delete) dead footer Contact/social links behind a single `// Re-enable once real contact/social URLs exist` comment, pending real URLs. See `landing_page_polish.md` memory for full detail.
3. **Cron job fully verified.** Job-count limit already confirmed 2026-08-04 (Hobby plan, 2/2 slots). This session confirmed the trigger itself actually fires: `CRON_SECRET` was marked Sensitive in Vercel (write-only, unrecoverable — same gotcha as the earlier `ADMIN_SECRET` incident, see `local_dev_environment.md`), so rotated it and redeployed, then manually invoked `/api/cron/memory-prompts` — got a clean `{ ok: true, emailsSent: 0, errors: {} }` (0 sent is correct, nobody was due in their per-recipient cadence today).
4. **`privacy@myolive.app` investigated, not yet done** — see the blocked decision at the top of this section.

**Caution carried forward:** the TLS/cert fix — do NOT just delete the `NODE_TLS_REJECT_UNAUTHORIZED` Vercel env var. A proper scoped fix already landed 2026-08-05 (commit `20e8952`, strips `sslmode` from the connection string so the pool's own `ssl` option actually applies) and is verified live — this note is just a reminder of why that env var removal broke things the first time, not an open risk anymore.

**2026-08-04 — full day summary (commits `74d55c4` through `d7294dc`), user pushed hard to close the entire code-only backlog in one session:**

1. **Backlog closeout (`74d55c4`)** — 5 items fixed via parallel background worktree agents, each diff independently re-verified before merge: register flow now syncs new admins into the relationship graph (`auth.ts`, was HANDOFF.md's stale "Priority 1"); 475 lines of dead code (`layoutPersonalView`) removed from `tree.tsx`; the mobile "Add Family Member" keyboard-cover bug actually root-caused (a Radix `onOpenAutoFocus` race with the dialog's own open animation, not just mitigated) and fixed in `members.tsx`; 2 dependency CVEs patched (`ip-address`, `esbuild`); a broken `pnpm-workspace.yaml` placeholder found and fixed (would fail any fully-fresh `pnpm install`); the full `orval codegen` regen finally run for real (found and fixed one schema-naming bug along the way, verified no live fields dropped) — closes `openapi_drift.md`'s long-open item for good.
2. **Memories feature (`6fd33dc`)** — live-verified end-to-end against production with a throwaway family (registered, tested, self-deleted, no debris left): deceased flag, auto-logged "Passing" life event, opt-in UI, and adding a memory all confirmed working. Found and fixed a real gap: the spec's "first prompt sent immediately on opt-in" was never wired up (opt-in only flipped a flag; only the daily cron ever sent prompts). Fixed by extracting the cron's per-person logic into a shared `sendMemoryPromptsForPerson()` and calling it from the opt-in endpoint too — live-verified, a real prompt email arrived within seconds of opting in, correct relationship wording and opt-out link.
3. **Cron + rate-limit (`3adcf21`)** — user manually ran `/api/cron/memory-prompts` from the Vercel dashboard: confirmed **Hobby plan, 2/2 cron slots used** (no headroom for a 3rd without upgrading), and the cron itself returned 200 (verified working, not just the immediate-send path). Reading those logs surfaced a real, live, exploitable bug: `auth.ts`'s login rate limiter always keyed on raw `req.ip` unnormalized, so any IPv6-connected attacker could rotate addresses within their own prefix and fully bypass the 10-attempt brute-force cap. Fixed using `express-rate-limit`'s own `ipKeyGenerator` helper (also fixed the same pattern in `ai.ts`'s lower-risk case).
4. **TLS incident (`92daf46` docs, env var change not in git)** — attempted to fix a related finding (a `NODE_TLS_REJECT_UNAUTHORIZED=0` Vercel env var disabling cert validation process-wide, not just for the DB). Deleting it **broke production login** (500s) — `DATABASE_URL`'s SSL mode needed it after all, the code-level pool option alone wasn't sufficient. Reverted within minutes (re-added the same value, redeployed), confirmed fixed via a live network-request check. The real fix (a proper Supabase CA cert instead of a blanket disable) is still open — see the caution item above before anyone touches this again. Full incident writeup: `security_audit.md` and `feedback_infra_changes.md` memory.

**Not done, by design:** business model stayed parked. The cross-family "shut out entirely" visibility tier check (the one untested tier in the access-control model) was offered but not run — still open, low urgency, doable the same way the memories feature was tested (throwaway linked test families) whenever picked back up.

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

## 🟡 Memories of the Deceased — end-to-end verified 2026-08-04, one real gap found

Ran a full live test against production with a throwaway test family (registered fresh, self-deleted afterward, no debris left): added "Mary" as Mom, marked her deceased with a date of passing, opted into memory collection, added a text memory, then checked the admin's real inbox for the promised immediate prompt email.

**Confirmed working:**
- Marking deceased + date of passing correctly auto-creates a "Passing" life event with the right date
- The opt-in prompt UI ("Start collecting memories of {name}?") appears exactly as spec'd right after marking someone deceased
- Opt-in flips `memoryCollectionEnabled` correctly; "Turn off memory collection" shows as admin-only, matching the asymmetric-friction design
- Adding a memory works end-to-end: publish-as-submitted immediately (no moderation queue), correct contributor attribution ("Jack MemTest · Me"), Edit/Delete controls present for the contributor

**Gap found AND fixed same session (commit `6fd33dc`):** the original spec (`legacy_memories_feature.md`) says the first prompt to each contributor is "sent immediately upon opt-in." This was never actually wired up — `POST /persons/:personId/memory-collection` only flipped the flag, and the only place `sendMemoryPrompt` was ever called was the daily cron. After researching the right call (triggered emails vs. batch — see `legacy_memories_feature.md` for the full writeup), extracted the cron's per-person targeting/opt-out/cadence/sequencing logic into a shared `sendMemoryPromptsForPerson()` (`artifacts/api-server/src/lib/memoryPromptSender.ts`) and call it from the opt-in endpoint too, best-effort and awaited (a serverless function isn't guaranteed to keep running after it responds). **Live-verified end-to-end after deploy**: fresh throwaway family, opted in, checked the real inbox with no artificial wait — email arrived within seconds: *"Hi Jack, Share a memory of your mother Mary. Share it on Olive → Don't want prompts about this person anymore? You can turn them off from their profile page."* Confirms relationship-aware wording, the generic-prompt-first sequencing, and the per-person opt-out link all work correctly, not just the targeting logic in isolation.

**Still open:**
- [x] Confirm the *daily cron sweep itself* still fires correctly — done same session: user manually ran it from the Vercel dashboard, returned 200. See START HERE above.
- [x] Confirm the `/api/cron/memory-prompts` Vercel cron job is within plan limits — done same session: **Hobby plan, 2/2 slots used** (this job + `birthday-emails`), no headroom for a 3rd. See START HERE above.
- [ ] Photo-attached memories (up to 3 photos) — not exercised in this pass, only text

Historical build/deploy notes below are superseded by the above for "is it verified" purposes.

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
- **DB connection disables TLS certificate validation process-wide — reverted after a live incident, real fix still open.** Found 2026-08-04 reading Vercel cron logs: a `NODE_TLS_REJECT_UNAUTHORIZED=0` env var in Vercel (Production, added May 16, same day as `DATABASE_URL`) disables cert validation for the *entire server process*, not just the DB connection — every other outgoing HTTPS call (OpenAI, Resend) loses cert validation too for that instance's lifetime. **Corrected an earlier wrong assumption:** this is NOT `pg` internally setting the env var as a side effect of `ssl: { rejectUnauthorized: false }` (verified by reading `pg`/`pg-connection-string` source directly — neither touches that env var) — it's a separate, directly-set Vercel env var. User deleted it and redeployed to test; **this broke production login with a live 500** (likely `DATABASE_URL`'s `sslmode=require` being treated strictly by a newer `pg`/connection-string version, with the code's own `ssl: { rejectUnauthorized: false }` on the pool not sufficient alone). Re-added the env var (value `0`, Production only) and redeployed — confirmed fixed via a live probe (`POST /api/auth/login` back to a normal 401, not 500). **Still open:** a real fix (sourcing Supabase's actual CA certificate instead of blanket-disabling validation) needs real research into what `DATABASE_URL`'s SSL mode actually requires before attempting again — do not retry the blind "just delete the env var" approach.
- **Rachel/Rhonda "Recent updates" timestamp question** — user flagged two people's activity timestamps as possibly inaccurate (2026-07-10). Traced the display logic, found no bug in it directly; two unconfirmed hypotheses exist (pre-fix no-op save, or "joined" label firing on record-creation vs. actual signup). Deferred by user, not revisited since.
- **Gendered relationship labels not yet confirmed live** — shipped 2026-07-14, backfilled for 66/82 existing people; not yet visually confirmed by the user in the Directory. Every family unit's admin still needs to set their own gender manually (their row's label, "Me", never implied one).

---

## 🟢 Open Follow-up

- **CORS allowlist vs. Vercel alias URLs** — the 2026-07-15 CORS restriction (see punch list above) broke login for the user because they were habitually using a Vercel-generated `*.vercel.app` alias URL rather than `https://myolive.app`. Not a bug — that origin was correctly rejected — but worth deciding: keep using `myolive.app` only (current default), or add the stable git-branch-tracking alias (e.g. `<project>-git-main-<team>.vercel.app`) to the CORS allowlist too if that URL gets used again. Not settled.

---

## 🔵 Backlog (Roughly Priority Order)

- [ ] Reply-to-email ingestion for the memories feature — was the spec'd *primary* contribution channel (60+ demographic, app-literacy risk) but the 2026-07-20 build deviated to deep-link-only; confirmed still open 2026-08-14, see `legacy_memories_feature.md`
- [ ] One-click, no-login unsubscribe for memory prompt emails — spec'd (magic-token, like invite-claim), only a "turn it off from the profile page" text pointer shipped; confirmed still open 2026-08-14
- [ ] Multiple accounts logged in at once on one device — research task, explicitly not started (queued 2026-08-14), see `next_session_todo.md`
- [ ] Invite/claiming flow — the "not listed → create new profile" self-service path inside `/join` is intentionally unreachable in the UI (backend/component code left intact); worth finishing later if ever prioritized
- [ ] Geographic map of family members — not started, no lat/long fields exist yet
- [ ] Ancestry.com import — not started
- [ ] Photo per life event — not started, scoped as last-priority within life events
- [ ] Real photography for the landing page — the hero/problem/CTA image slots are still abstract gradient placeholders (`PhotoPlaceholder` in `landing.tsx`), flagged before any real public push
- [ ] "Learn More" destination under the second-brain section on the landing page was removed 2026-07-15 (had nowhere real to point); revisit if a dedicated "how it works" page or demo ever gets built
- [ ] Stripe integration — on hold until [Business Model](#business-model) is decided
- [ ] Dependency vulnerability scanning in CI — no CI pipeline exists at all currently (see `security.md` §7)
- [ ] Memory book PDF export — deliberately deferred out of the memories-of-the-deceased v1 (see above); revisit alongside the business model decision once that feature is live and it's clear whether it's actually getting used

### Already Shipped, Listed Here for Completeness (don't re-propose these)
Directory search, Google Calendar/iCal button (Birthdays page only), Venmo & social links, public landing page (direct self-serve "Create Directory" CTA, waitlist framing removed 2026-07-20, olive/gold palette applied site-wide), life events CRUD, birthday email notifications (redesigned with real brand styling 2026-08-14), multi-admin + layered permissions, privacy statement page + real `privacy@myolive.app` contact link (terms/privacy Questions sections + footer, confirmed live 2026-08-14), per-handle social visibility toggles (fully granular, confirmed 2026-08-14), profile completeness indicator (self-view Home progress bar + admin-viewing-others on the profile page, Directory-card badge deliberately removed 2026-08-14 per user feedback), home-page life events feed wired to real `life_events` data (2026-08-14), viewer-relative relationship labels, gendered relationship labels, admin-grant confirmation + Admins settings card, printable/PDF family directory export, mobile UI audit (full punch list, see below), self-serve account deletion + admin-only orphaned-family-unit cleanup tool (2026-07-25, see START HERE above).

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
- **Security/stability audit pass** (2026-08-14, `6d8650a`) — tier-2 contact-info leak, unbounded free-text fields, cross-family `parentPersonId` injection, AI-chat add-member admin check (behavior change). See START HERE above for full detail.
- **Transactional email redesign** (2026-08-14, `beab4db`) — real brand styling + button CTAs across all 5 Resend email types, plus a real functional fix (day-before reminder now links to the birthday person's profile). See START HERE above.
- **Weeks 2-3 backlog closed**: profile completeness (2026-08-13/14, `0881806`/`1ba3d96`/`473e3db`), home-page life events feed (2026-08-14, `fa863a6`), per-field social visibility confirmed already-built. See START HERE above.
- **Relative picker (cousin/great-grandchild/in-law-parent) + AI-chat orphan gaps closed + footer Contact popover** (2026-08-13, `df6e936`, `a6a0e4c`) — see START HERE above for full detail. Closes `suggestions_shortlist.md` item #26 for good.
- **Self-birthday email fix + `privacy@myolive.app` forwarding live** (2026-08-12, `6944d42`) — see START HERE above for full detail. The day-before birthday reminder cron sent the birthday person themselves the generic "X has a birthday, reach out!" copy meant for other family members; now they get a distinct personalized email instead. Also: `privacy@myolive.app` forwarding stood up via free ImprovMX + Vercel DNS (MX/SPF/DMARC records), forwarding to the user's own Gmail for now with an easy hand-off path to the supervisor's email later.
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
