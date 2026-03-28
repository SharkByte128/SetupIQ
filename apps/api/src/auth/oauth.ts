import type { FastifyInstance } from "fastify";
import oauthPlugin from "@fastify/oauth2";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export async function registerAuth(app: FastifyInstance): Promise<void> {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const microsoftClientId = process.env.MICROSOFT_CLIENT_ID;
  const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (googleClientId && googleClientSecret) {
    await app.register(oauthPlugin, {
      name: "googleOAuth2",
      scope: ["openid", "email", "profile"],
      credentials: {
        client: { id: googleClientId, secret: googleClientSecret },
        auth: oauthPlugin.GOOGLE_CONFIGURATION,
      },
      startRedirectPath: "/auth/google",
      callbackUri: `${process.env.API_URL || "http://localhost:3001"}/auth/google/callback`,
    });
  }

  if (microsoftClientId && microsoftClientSecret) {
    await app.register(oauthPlugin, {
      name: "microsoftOAuth2",
      scope: ["openid", "email", "profile"],
      credentials: {
        client: { id: microsoftClientId, secret: microsoftClientSecret },
        auth: oauthPlugin.MICROSOFT_CONFIGURATION,
      },
      startRedirectPath: "/auth/microsoft",
      callbackUri: `${process.env.API_URL || "http://localhost:3001"}/auth/microsoft/callback`,
    });
  }
}
