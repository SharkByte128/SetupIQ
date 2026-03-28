import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

async function start(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  });

  await app.register(cookie);

  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  await app.listen({ port: PORT, host: HOST });
}

start();
