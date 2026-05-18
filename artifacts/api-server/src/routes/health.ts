import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Temporary diagnostic endpoint — remove after DB connection is confirmed
router.get("/healthz/db", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ db: "ok" });
  } catch (err) {
    const e = err as Error & { cause?: unknown };
    res.status(500).json({
      db: "error",
      message: e.message,
      cause: e.cause instanceof Error ? e.cause.message : String(e.cause ?? ""),
      code: (e.cause as Record<string, unknown>)?.code,
    });
  }
});

export default router;
