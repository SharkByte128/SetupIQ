import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { registerAuth } from "./auth/oauth.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerSyncRoutes } from "./sync/routes.js";
import { registerRecommendationRoutes } from "./recommendations/routes.js";
import { registerNltRoutes } from "./nlt/routes.js";
import { registerGeminiRoutes } from "./gemini/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

async function start(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  });

  await app.register(cookie);
  await registerAuth(app);
  await registerAuthRoutes(app);
  await registerSyncRoutes(app);
  await registerRecommendationRoutes(app);
  await registerNltRoutes(app);
  await registerGeminiRoutes(app);

  // Serve /docs folder as static files
  // In Docker: /app/docs; in dev: relative to source
  const docsRoot = process.env.DOCS_ROOT || path.resolve(__dirname, "../../../docs");
  await app.register(fastifyStatic, {
    root: docsRoot,
    prefix: "/docs/",
    decorateReply: false,
  });

  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  await app.listen({ port: PORT, host: HOST });
}

start();
