import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Vercel puts one proxy hop in front of the function; trust it so
// express-rate-limit (and req.ip generally) sees the real client IP from
// X-Forwarded-For instead of treating every request as the same address.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet());

// The SPA and API are served from the same Vercel deployment, so real
// browser traffic is same-origin and never hits this check at all -- this
// allowlist only matters for a *different* origin's browser trying to call
// the API directly (e.g. with a stolen token in a crafted request).
const allowedOrigins = new Set(
  [
    "https://myolive.app",
    process.env.APP_BASE_URL,
    process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined,
    process.env.NODE_ENV !== "production" ? "http://localhost:5173" : undefined,
  ].filter((origin): origin is string => Boolean(origin)),
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Log unhandled errors so they appear in Vercel runtime logs
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const e = err as Error & { status?: number; statusCode?: number; type?: string; cause?: unknown };
  const status = e.status ?? e.statusCode ?? 500;
  // TEMPORARY: this generic handler was silently normalizing every error
  // (including e.g. a body-parser SyntaxError, which carries its own 400
  // status) to a bare 500 with no detail -- turns out this exact handler,
  // not any route-level code, was firing on a live login failure that no
  // route-specific try/catch could ever have caught. Surfacing the real
  // status/message/type until that's confirmed and resolved.
  res.status(status).json({
    error: "Internal Server Error",
    message: `[TEMP DEBUG] ${e.name ?? "Error"}: ${e.message ?? String(err)}${e.type ? ` | type: ${e.type}` : ""}${e.cause ? ` | cause: ${String(e.cause)}` : ""}`,
  });
});

export default app;
