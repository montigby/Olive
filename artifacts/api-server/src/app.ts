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
      // `false` (not an Error) so a disallowed origin fails the CORS check
      // without falling into the app's generic error handler -- that would
      // 500 and log every scanner/bot hitting the API from a random origin
      // as an "Unhandled error", burying real errors in Vercel's logs. The
      // request is blocked either way; only the response shape changes.
      callback(null, !origin || allowedOrigins.has(origin));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Log unhandled errors so they appear in Vercel runtime logs
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal Server Error" });
});

export default app;
