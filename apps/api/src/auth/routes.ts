import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "@fastify/jwt";
import { randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET || "setupiq-dev-secret-change-in-production";
const COOKIE_NAME = "setupiq_token";
const IS_PROD = process.env.NODE_ENV === "production";

interface OAuthUserInfo {
  email: string;
  name: string;
  provider: "google" | "microsoft";
}

async function fetchGoogleUser(accessToken: string): Promise<OAuthUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Google user info");
  const data = await res.json() as { email: string; name: string };
  return { email: data.email, name: data.name, provider: "google" };
}

async function fetchMicrosoftUser(accessToken: string): Promise<OAuthUserInfo> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Microsoft user info");
  const data = await res.json() as { mail?: string; userPrincipalName: string; displayName: string };
  return {
    email: data.mail || data.userPrincipalName,
    name: data.displayName,
    provider: "microsoft",
  };
}

async function upsertUser(info: OAuthUserInfo): Promise<{ id: string; email: string; displayName: string }> {
  const existing = await db.select().from(users).where(eq(users.email, info.email)).limit(1);

  if (existing.length > 0) {
    const user = existing[0];
    return { id: user.id, email: user.email, displayName: user.displayName };
  }

  const inserted = await db
    .insert(users)
    .values({
      email: info.email,
      displayName: info.name,
      provider: info.provider,
    })
    .returning({ id: users.id, email: users.email, displayName: users.displayName });

  return inserted[0];
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  await app.register(jwt, {
    secret: JWT_SECRET,
    cookie: { cookieName: COOKIE_NAME, signed: false },
  });

  // Decorator to get current user from JWT
  app.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: "Unauthorized" });
    }
  });

  // ─── Google callback ──────────────────────────────────────

  app.get("/auth/google/callback", async function (request, reply) {
    const oauth2 = (app as any).googleOAuth2;
    if (!oauth2) return reply.status(404).send({ error: "Google auth not configured" });

    const { token } = await oauth2.getAccessTokenFromAuthorizationCodeFlow(request);
    const userInfo = await fetchGoogleUser(token.access_token as string);
    const user = await upsertUser(userInfo);

    const jwtToken = app.jwt.sign(
      { id: user.id, email: user.email, displayName: user.displayName },
      { expiresIn: "7d" }
    );

    reply.setCookie(COOKIE_NAME, jwtToken, {
      path: "/",
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.redirect(`${FRONTEND_URL}/auth/callback`);
  });

  // ─── Microsoft callback ───────────────────────────────────

  app.get("/auth/microsoft/callback", async function (request, reply) {
    const oauth2 = (app as any).microsoftOAuth2;
    if (!oauth2) return reply.status(404).send({ error: "Microsoft auth not configured" });

    const { token } = await oauth2.getAccessTokenFromAuthorizationCodeFlow(request);
    const userInfo = await fetchMicrosoftUser(token.access_token as string);
    const user = await upsertUser(userInfo);

    const jwtToken = app.jwt.sign(
      { id: user.id, email: user.email, displayName: user.displayName },
      { expiresIn: "7d" }
    );

    reply.setCookie(COOKIE_NAME, jwtToken, {
      path: "/",
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.redirect(`${FRONTEND_URL}/auth/callback`);
  });

  // ─── Current user ─────────────────────────────────────────

  app.get("/auth/me", async function (request, reply) {
    try {
      await request.jwtVerify();
      const payload = request.user as { id: string; email: string; displayName: string };
      return { id: payload.id, email: payload.email, displayName: payload.displayName };
    } catch {
      return reply.status(401).send({ error: "Not authenticated" });
    }
  });

  // ─── Logout ───────────────────────────────────────────────

  app.post("/auth/logout", async function (_request, reply) {
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  // ─── Register (username → apiToken) ───────────────────────

  app.post("/auth/register", async function (request: FastifyRequest<{ Body: { username: string } }>, reply: FastifyReply) {
    const { username } = request.body;
    if (!username || typeof username !== "string" || username.trim().length < 2) {
      return reply.status(400).send({ error: "Username must be at least 2 characters" });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check if username already exists
    const existing = await db.select().from(users).where(eq(users.username, cleanUsername)).limit(1);
    if (existing.length > 0) {
      return reply.status(409).send({ error: "Username already taken" });
    }

    const apiToken = randomBytes(32).toString("hex");

    const inserted = await db
      .insert(users)
      .values({
        email: `${cleanUsername}@token.local`,
        displayName: cleanUsername,
        provider: "token",
        username: cleanUsername,
        apiToken,
      })
      .returning({ id: users.id, username: users.username, displayName: users.displayName });

    return { username: inserted[0].username, apiToken };
  });

  // ─── Token Login (username + apiToken → JWT) ──────────────

  app.post("/auth/token-login", async function (request: FastifyRequest<{ Body: { username: string; apiToken: string } }>, reply: FastifyReply) {
    const { username, apiToken } = request.body;
    if (!username || !apiToken) {
      return reply.status(400).send({ error: "Username and API token required" });
    }

    const cleanUsername = username.trim().toLowerCase();

    const found = await db
      .select()
      .from(users)
      .where(and(eq(users.username, cleanUsername), eq(users.apiToken, apiToken)))
      .limit(1);

    if (found.length === 0) {
      return reply.status(401).send({ error: "Invalid username or API token" });
    }

    const user = found[0];
    const jwtToken = app.jwt.sign(
      { id: user.id, email: user.email, displayName: user.displayName },
      { expiresIn: "30d" }
    );

    return { token: jwtToken, user: { id: user.id, username: user.username, displayName: user.displayName } };
  });
}
