// Reply-to-email ingestion for the memories-of-the-deceased feature. A
// contributor hits "reply" on a memory-prompt email (Reply-To was set to a
// per-send address, see lib/email.ts's sendMemoryPrompt) and, with no login
// at all, their reply becomes a memory -- the spec's original low-friction
// ask (see legacy_memories_feature in the auto-memory system) that the
// initial 2026-07-20 build deviated from in favor of deep-link-only.
import { Router, type Request } from "express";
import { db, personsTable, memoriesTable, memoryPromptLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getClient, sendMemoryReplyConfirmation } from "../lib/email";
import { stripQuotedReply } from "../lib/emailReplyParser";
import { MAX_BODY_LENGTH } from "./memories";

declare global {
  namespace Express {
    interface Request {
      // Populated by app.ts's express.json({ verify }) hook -- the exact
      // bytes Resend signed, needed because re-serializing a parsed
      // req.body would not reproduce the same bytes and would break
      // signature verification.
      rawBody?: Buffer;
    }
  }
}

const router = Router();

// "mp-<uuid>@reply.myolive.app" -- see lib/email.ts's REPLY_DOMAIN/replyTo.
const REPLY_ADDRESS_PATTERN = /^mp-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@reply\.myolive\.app$/i;

function extractReplyLogId(toAddresses: string[]): string | null {
  for (const addr of toAddresses) {
    const match = REPLY_ADDRESS_PATTERN.exec(addr.trim());
    if (match) return match[1]!.toLowerCase();
  }
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function handleInboundReply(emailId: string, toAddresses: string[]): Promise<void> {
  const logId = extractReplyLogId(toAddresses);
  if (!logId) return; // not addressed to a memory-prompt reply address

  const [logRow] = await db
    .select()
    .from(memoryPromptLogTable)
    .where(eq(memoryPromptLogTable.id, logId))
    .limit(1);
  // A missing row means an unknown/expired id -- most likely the person or
  // recipient was deleted since (FK cascade removes the log row with them).
  if (!logRow) return;

  const [person] = await db
    .select({
      id: personsTable.id,
      firstName: personsTable.firstName,
      lastName: personsTable.lastName,
      familyUnitId: personsTable.familyUnitId,
      memoryCollectionEnabled: personsTable.memoryCollectionEnabled,
    })
    .from(personsTable)
    .where(eq(personsTable.id, logRow.personId))
    .limit(1);
  const [recipient] = await db
    .select({ id: personsTable.id, firstName: personsTable.firstName, email: personsTable.email })
    .from(personsTable)
    .where(eq(personsTable.id, logRow.recipientPersonId))
    .limit(1);
  if (!person || !recipient) return;
  // Collection may have been turned off since this specific prompt went out.
  if (!person.memoryCollectionEnabled) return;

  const client = await getClient();
  const { data: email, error } = await client.emails.receiving.get(emailId);
  if (error || !email) {
    logger.warn({ error, emailId }, "Could not retrieve inbound email content from Resend");
    return;
  }

  const rawText = email.text ?? htmlToPlainText(email.html ?? "");
  const body = stripQuotedReply(rawText).slice(0, MAX_BODY_LENGTH);
  if (!body) return; // nothing left after stripping the quoted reply chain

  try {
    await db.insert(memoriesTable).values({
      personId: person.id,
      familyUnitId: person.familyUnitId,
      contributorPersonId: recipient.id,
      body,
      photoUrls: [],
      sourceEmailId: emailId,
    });
  } catch (err) {
    // Resend retried this exact delivery (its own documented at-least-once
    // guarantee) -- the unique constraint on sourceEmailId means it's
    // already saved, nothing left to do.
    if (isUniqueViolation(err)) return;
    throw err;
  }

  if (recipient.email) {
    await sendMemoryReplyConfirmation({
      to: recipient.email,
      recipientName: recipient.firstName,
      personName: `${person.firstName} ${person.lastName}`,
      personId: person.id,
    }).catch((err) => {
      logger.warn({ err }, "Failed to send memory-reply confirmation email");
    });
  }
}

// POST /api/webhooks/resend-inbound
// Public (no requireAuth -- Resend itself is the caller), authenticated
// instead by verifying its signature against RESEND_WEBHOOK_SECRET. Always
// responds 200 once the signature checks out, even if the specific email
// wasn't actionable (spam, a stray reply to an expired token, an empty
// reply) -- Resend retries non-2xx responses, and none of those cases would
// ever be fixed by a retry.
router.post("/webhooks/resend-inbound", async (req: Request, res) => {
  if (!process.env.RESEND_WEBHOOK_SECRET) {
    logger.error("RESEND_WEBHOOK_SECRET is not set; rejecting inbound webhook");
    res.status(503).json({ error: "Not configured" });
    return;
  }

  let payload: { type?: string; data?: { email_id?: string; to?: string[] } };
  try {
    const client = await getClient();
    payload = client.webhooks.verify({
      payload: req.rawBody?.toString("utf8") ?? "",
      headers: {
        id: String(req.headers["svix-id"] ?? ""),
        timestamp: String(req.headers["svix-timestamp"] ?? ""),
        signature: String(req.headers["svix-signature"] ?? ""),
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    }) as typeof payload;
  } catch (err) {
    logger.warn({ err }, "Rejected inbound webhook: signature verification failed");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  if (payload.type !== "email.received" || !payload.data?.email_id) {
    res.json({ ok: true }); // an event type we don't act on -- ack, not an error
    return;
  }

  try {
    await handleInboundReply(payload.data.email_id, payload.data.to ?? []);
  } catch (err) {
    logger.error({ err, emailId: payload.data.email_id }, "Failed to process inbound memory reply");
    // Still 200 below -- see the handler comment above.
  }

  res.json({ ok: true });
});

export default router;
