# Security Guide for Olive (Family Branch)

Last updated: 2026-07-21 — memories-of-the-deceased feature re-audit (see below). Original audit: 2026-07-13, punch list closed 2026-07-15. Re-run this audit periodically (see "Keeping This Current" at the bottom) since security isn't a one-time checklist.

This is Olive's version of a generic "security basics for non-developers building fast with AI" guide, rewritten against Olive's actual stack (Vercel + Supabase Postgres + Express + Drizzle ORM + React, not Replit) and checked against the real codebase rather than written as generic advice. Every section below says what Olive actually does today, not just what it should do.

Olive holds real personal data for real families — addresses, phone numbers, birthdays, kids' information. Getting this right matters more than it would for a typical side project, because the whole product's pitch is trust.

---

## 1. Secrets & Environment Variables

**Why it matters:** if a secret is hardcoded or has an insecure fallback, anyone who sees the code (or guesses the fallback) gets access without ever needing to steal anything.

**Where Olive stands:**
- `DATABASE_URL` — handled well. The app throws and refuses to start if this is missing, both in `lib/db/src/index.ts` and `drizzle.config.ts`. Fail-closed, as it should be.
- `RESEND_API_KEY`, `OPENAI_API_KEY` — loaded from `process.env` normally, no hardcoded values anywhere in the repo.
- `ADMIN_SECRET` — **gap.** `artifacts/api-server/src/routes/admin.ts` falls back to a hardcoded string (`"olive-admin-2026"`) if the env var isn't set, and only logs a warning in production — it doesn't block the fallback from working. If this env var was never actually set on Vercel, the admin backfill endpoint is protected by a publicly-known string (it's written in this very repo's docs).
- `SESSION_SECRET` (JWT signing key) — **bigger gap, and not previously documented anywhere.** `artifacts/api-server/src/middlewares/auth.ts` falls back to `"fallback-dev-secret"` with **zero warning, even in production**. This secret signs every login session in the app — if it's ever missing in Vercel's env config, every user's session security rests on a well-known string, silently.
- `.gitignore` — currently excludes `.env*.local` but not a plain `.env`. No `.env` file exists in the repo right now, so nothing has leaked, but the pattern itself is a trap waiting for the first person who instinctively creates a plain `.env` file.

**What to do:** make both `ADMIN_SECRET` and `SESSION_SECRET` fail-closed in production (refuse to start, like `DATABASE_URL` already does) instead of silently falling back — but only after confirming both are actually set in Vercel's environment variables first, since flipping this before confirming that could take the whole app down. Add a bare `.env` line to `.gitignore`.

---

## 2. Session / Login Handling

**Why it matters:** if a stolen session token stays valid indefinitely, or a "logout" doesn't actually log anyone out, an attacker who gets a token once has it for good.

**Where Olive stands:**
- JWTs are signed with a 30-day expiry (`middlewares/auth.ts`) and stored in the browser's `localStorage` (`lib/auth.tsx`, and read directly across many pages).
- **Gap:** logout (`POST /api/auth/logout`) is purely cosmetic — it just returns a success message. There's no server-side token blacklist/revocation, so a copied or stolen token stays valid for the full 30 days regardless of logging out or even changing your password.
- **Gap:** because the token lives in `localStorage` rather than an httpOnly cookie, any successful XSS anywhere in the app can read it directly with JavaScript. There's currently no Content-Security-Policy (see §5) to reduce that risk, and no CSRF-specific protection — though CSRF is a smaller concern here since the API uses a Bearer token, not cookies, for auth.

**What to do:** this is a real architectural tradeoff, not a quick fix — a proper fix means server-side session revocation (a sessions/tokens table checked on every request) or shortening the expiry significantly. Worth planning for eventually, not urgent today given Olive's current scale and audience.

---

## 3. Database Query Safety

**Why it matters:** unsanitized queries let an attacker manipulate your database directly (SQL injection) — this is one of the most damaging classic web vulnerabilities.

**Where Olive stands:** **handled well.** Every single database call goes through Drizzle ORM's parameterized queries — there is no raw string-concatenated SQL anywhere in the codebase. This was actually verified line-by-line, not assumed.

**One small, separate leak found:** `GET /api/healthz/db` is an unauthenticated diagnostic endpoint (its own code comment says "remove after DB connection is confirmed") that returns raw database error messages to anyone who hits it. Low risk (no actual data, just connection error text), but it's forgotten debug code that should be deleted.

**What to do:** delete or restrict the `/healthz/db` diagnostic route.

---

## 4. Third-Party Tools & the AI Chat Assistant

**Why it matters:** Olive's AI chat can add, edit, and delete family members — if it could be tricked by a cleverly worded message into acting outside its lane, that's a real risk, not a hypothetical one.

**Where Olive stands:** **handled well, this was the best-scoring section.** Every AI tool call is checked against the authenticated user's own `familyUnitId` before anything happens — the AI has no way to even reference a different family's data, since the family unit comes from the JWT, not anything the user or the model can supply. Within a family, actions are further gated by real permission checks (self, admin, parent-of) matching the rest of the app's permission model. There's no dedicated prompt-injection filter, but the actual backstop — server-side authorization on every action — is in place and is the part that actually matters.

Resend and OpenAI keys are loaded safely (see §1). Olive doesn't currently receive webhooks from any third party, so there's no missing signature-verification gap to worry about yet — only something to remember if a Resend delivery/bounce webhook gets added later.

**What to do:** nothing urgent here. If a webhook is ever added, verify its signature before trusting the payload.

---

## 5. Frontend Basics

**Why it matters:** even "just a directory app" can be exploited through the browser if scripts can run somewhere they shouldn't.

**Where Olive stands:**
- No `eval()`, no raw `.innerHTML` usage anywhere in the frontend.
- Exactly one `dangerouslySetInnerHTML` usage, in a chart-styling component, fed only by developer-configured color values — not user data. Low risk.
- **Gap:** no Content-Security-Policy anywhere (not in `index.html`, not as a header). This is the thing that would limit the blast radius if an XSS bug ever did slip in — right now nothing's stopping an injected script from running freely.
- HTTPS is Vercel's default — nothing to configure.

**What to do:** add a CSP header (can be done via Vercel config or a small Express middleware addition) and consider adding `helmet` for a batch of standard headers at once — see §8, same root fix covers both.

---

## 6. Passwords & Login Security

**Why it matters:** weak password storage or unlimited login attempts are two of the most common ways real accounts get compromised.

**Where Olive stands:**
- **Handled well:** passwords are hashed with bcrypt at cost factor 12 (a solid, current standard) everywhere a password is set — registration, change-password, and profile-claim all confirmed.
- **Handled well:** the 8-character password minimum is actually enforced server-side (via a real Zod validation check), not just documented as a suggestion.
- **Gap:** there is no rate limiting on login at all. Someone could attempt to brute-force a known email's password with unlimited tries — the only friction is bcrypt's inherent per-attempt cost, which isn't nothing, but isn't a real defense either.
- **Not a security gap, but a product gap:** there's no "forgot password" self-service flow yet — only an in-app change-password for people who already remember their current one.

**What to do:** add basic rate limiting to the login endpoint (a small `express-rate-limit` addition — e.g. lock an IP/email pair out after 5-10 failed attempts for a few minutes). This is a genuinely quick, low-risk fix.

---

## 7. Keeping Dependencies Current

**Why it matters:** even code you never touch again can become a vulnerability if a library it depends on gets a disclosed CVE.

**Where Olive stands:** `pnpm-workspace.yaml` already has `minimumReleaseAge: 1440` (a 24-hour minimum age before a new package version can be installed) — a real, deliberate supply-chain protection against fresh malicious releases. **Gap:** there's no automated `pnpm audit` step anywhere — no CI workflow exists in the repo at all, so known vulnerabilities in already-pinned versions are never automatically flagged.

**What to do:** periodically run `pnpm audit` manually (or ask me to, next time we talk) until/unless a CI pipeline gets set up to do it automatically.

---

## 8. Headers, CORS, Rate Limiting, 2FA

**Why it matters:** these are the "seatbelt" protections — they don't stop a determined attacker by themselves, but they close off a lot of easy, automated abuse.

**Where Olive stands, across the board — this is the weakest section:**
- **CORS is wide open** (`cors()` with no configuration) — any website can make cross-origin requests to Olive's API. Should be restricted to `https://myolive.app` (and a local dev origin).
- **No security headers at all** — no CSP, no `X-Frame-Options`, no `Strict-Transport-Security`, no `X-Content-Type-Options`. Adding the `helmet` package is the standard one-line-ish fix for most of these at once.
- **No rate limiting anywhere in the API**, not just login — including the OpenAI-backed AI chat endpoint, meaning a compromised account could rack up real OpenAI API costs with no cap.
- **The birthday-email cron job's secret check can be bypassed** by simply setting a `user-agent` header containing `"vercel-cron"` — a value anyone can set on any request. Low real-world damage (just triggers unwanted birthday emails), but it means the "protection" isn't really protecting anything right now.
- **No 2FA** — expected at this stage, not flagged as urgent.

**What to do:** this cluster of fixes (CORS allowlist, `helmet`, basic rate limiting, fixing the cron bypass) is the highest-value, lowest-effort security work available right now — they're mostly small, well-understood additions rather than architecture changes.

---

## Priority Punch List (ranked by risk × effort) — CLOSED 2026-07-15

All five items fixed and verified live (commits `82fee68`, `d7d612c`, `2f1a626`, `34309b7`):

1. ~~**JWT secret (`SESSION_SECRET`) fail-closed in production**~~ — done. `auth.ts` now throws at boot if missing, matching the `DATABASE_URL` pattern. Confirmed `SESSION_SECRET` was already set in Vercel Production before shipping this.
2. ~~**Fix the spoofable cron secret bypass** and **delete/restrict `/healthz/db`**~~ — done. Cron now checks Vercel's real `Authorization: Bearer <CRON_SECRET>` header instead of a spoofable user-agent string; `/healthz/db` deleted outright.
3. ~~**Restrict CORS to the real domain + add `helmet`**~~ — done. CORS allowlisted to `https://myolive.app` (+ `APP_BASE_URL`, + localhost in dev); `helmet` added for CSP/HSTS/X-Frame-Options/etc. Verified the CSP header only appears on `/api/*` JSON responses, not on the SPA's static HTML.
4. ~~**Add login rate limiting**~~ — done, and extended to the AI chat endpoint too since that had the same "no cap at all" gap but against real OpenAI spend rather than login attempts. `/api/auth/login`: 10 attempts/10min keyed by IP+email. `/api/ai/chat`: 30 requests/15min keyed by personId. Verified live: the 11th rapid login attempt returns 429.
5. ~~**Fix `ADMIN_SECRET` the same way as #1**~~ — done, and it turned out more urgent than originally scored: the Vercel dashboard (checked 2026-07-15) showed `ADMIN_SECRET` wasn't set there at all, meaning admin endpoints had been *actively* running on the hardcoded `"olive-admin-2026"` fallback in production, not just exposed to a hypothetical misconfiguration. User added a real random value to Vercel (Production + Preview); `admin.ts` now throws at boot if it's missing, matching the `SESSION_SECRET`/`DATABASE_URL` pattern. Verified live: app boots fine, the old hardcoded fallback now gets 403, the real secret still authenticates. Also fixed the `.gitignore` gap (a plain `.env` is now excluded, not just `.env*.local`).
6. Everything else (session revocation, dependency-audit automation, 2FA) — real work, not urgent at Olive's current scale, worth planning for as the user base grows.

## Re-audit: Memories-of-the-Deceased Feature (2026-07-21)

Targeted re-check per the "re-run before onboarding real families / when new personal data is touched" rule, since this feature added `deceased`/`dateOfPassing` and a whole new `memories` table.

**Handled well:** family-unit scoping, contributor/admin permission checks, and cron-secret auth all correctly extend to every new route (`memories.ts`, `cron.ts`'s `/cron/memory-prompts`); the AI chat's `add_memory` tool inherits the existing per-family scoping and the `/api/ai/chat` rate limit; deceased-marking reuses the same `canEditPerson` check as every other profile field, no new permission path invented.

**Found and fixed:** `photoUrls` on memories was accepted as any string, not validated as an actual image — since the frontend renders it directly as `<img src>` and the SPA's static HTML has no CSP (see §5/§8 above), a raw external URL could have been stored and used as a tracking pixel against every family member who later viewed that memory. Fixed by restricting `validatePhotoUrls` (`memories.ts`) to `data:image/...;base64,` URIs, matching the only path the UI actually produces photos through.

**Pre-existing, not new:** `persons.photoUrl` (the regular profile picture field) has the identical gap — plain `zod.string()`, no format check. Same fix pattern would apply if this is ever prioritized; not urgent since it's a single field vs. memories' 3-per-entry, unauthenticated-write surface.

---

## Keeping This Current

Security isn't a one-time pass. Re-run this audit (ask me to redo it, referencing this file) roughly every time a major new feature touches auth, payments, or new personal data — and at minimum before onboarding any real families beyond your own testing. Update the "Last updated" line at the top each time.
