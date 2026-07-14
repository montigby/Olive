import { Router } from "express";
import { db } from "@workspace/db";
import { waitlistSignupsTable } from "@workspace/db";
import { WaitlistSignupBody } from "@workspace/api-zod";

const router = Router();

// POST /api/waitlist -- public, no auth. Idempotent: re-submitting the same
// email is not an error (onConflictDoNothing), so a visitor double-clicking
// or resubmitting the form doesn't see a confusing failure.
router.post("/waitlist", async (req, res) => {
  const parsed = WaitlistSignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  await db
    .insert(waitlistSignupsTable)
    .values({ email: parsed.data.email.trim().toLowerCase() })
    .onConflictDoNothing();

  res.status(201).json({ ok: true });
});

export default router;
