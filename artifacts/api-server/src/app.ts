import path from "path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter } from "./middlewares/rateLimit";
import { seamlessHandler } from "./routes/fiverscan";

const app: Express = express();

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
app.use(cors());
// Capture raw body before JSON parse so webhook can verify HMAC against original bytes
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// Fiverscan seamless callback aliases — Fiverscan POSTs to whatever URL is
// set as the agent's "Site EndPoint", which is sometimes the bare domain
// root or a custom path. These aliases let the webhook reach our handler
// regardless of which path the operator configured. They sit OUTSIDE /api so
// they bypass the global rate limiter (provider bursts can be high).
// Fiverscan appends a fixed suffix (`/gold_api`) to whatever the operator sets
// as the Site EndPoint, e.g. SiteEndPoint=`https://x.com/api/fiverscan/seamless`
// → callbacks land at `https://x.com/api/fiverscan/seamless/gold_api`. We
// accept both the bare paths AND each path with the `/gold_api` suffix so any
// reasonable Site EndPoint configuration just works. We also accept GET on the
// same paths so their reachability probe returns 200 instead of 404.
const seamlessRoots = [
  "/",
  "/seamless",
  "/fiverscan",
  "/fiverscan/seamless",
  "/api/seamless",
  "/api/fiverscan",
  "/api/fiverscan/seamless",
  "/callback/fiverscan",
  "/api/callback/fiverscan",
];
const seamlessSuffixes = ["", "/gold_api", "/api"];
for (const root of seamlessRoots) {
  for (const suffix of seamlessSuffixes) {
    const p = (root + suffix).replace(/\/+/g, "/");
    // POST: /api roots are handled by the /api router, so only register
    // top-level (non-/api) POST aliases here.
    if (!(p.startsWith("/api/") && suffix === "")) {
      app.post(p, seamlessHandler);
    }
    // GET: only register a probe responder on explicit seamless paths — never
    // on "/" which is the SPA homepage. We respond 200 so the Fiverscan agent
    // panel's reachability check passes.
    if (p !== "/") {
      app.get(p, (_req, res) => {
        res.status(200).json({ status: 1, msg: "OK" });
      });
    }
  }
}

app.use("/api", globalLimiter, router);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global JSON error handler for /api — guarantees the SPA never receives
// Express's default HTML error page (which crashes the admin's `r.json()`
// calls with "Unexpected token '<' ... is not valid JSON"). Must be
// registered AFTER the /api router and 404 handler.
app.use("/api", (err: any, req: any, res: any, _next: any) => {
  if (res.headersSent) return;
  const msg =
    typeof err?.message === "string" && err.message.length > 0
      ? err.message
      : "Internal server error";
  try {
    req.log?.error({ err }, "Unhandled /api error");
  } catch { /* logger may not be attached */ }
  res.status(err?.status ?? 500).json({ error: msg });
});

if (process.env["NODE_ENV"] === "production") {
  const frontendDist = path.resolve(
    import.meta.dirname ?? __dirname,
    "../../blixbet/dist/public",
  );
  app.use(
    express.static(frontendDist, {
      maxAge: "1y",
      immutable: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );
  app.use((_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  // Dev: forward non-/api requests to the Vite dev server so the SPA loads
  // through the same origin as the API. Both artifacts claim path "/" in dev,
  // and the proxy routes to whichever wins; we restore the SPA either way.
  const vitePort = process.env["VITE_DEV_PORT"] || "21790";
  const viteTarget = `http://localhost:${vitePort}`;
  const { createProxyMiddleware } = await import("http-proxy-middleware");
  app.use(
    createProxyMiddleware({
      target: viteTarget,
      changeOrigin: true,
      ws: true,
      logger: undefined,
    }),
  );
}

export default app;
