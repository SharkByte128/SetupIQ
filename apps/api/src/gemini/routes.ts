import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiProxyBody {
  model?: string;
  systemInstruction: { parts: { text: string }[] };
  contents: { parts: { text: string }[] }[];
  generationConfig?: Record<string, unknown>;
}

export async function registerGeminiRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/gemini/generate", async function (request: FastifyRequest<{ Body: GeminiProxyBody }>, reply: FastifyReply) {
    if (!GEMINI_API_KEY) {
      return reply.status(503).send({ error: "Gemini API key not configured on server" });
    }

    const body = request.body;
    if (!body?.contents?.length) {
      return reply.status(400).send({ error: "Missing contents" });
    }

    const model = body.model || "gemini-2.5-flash";

    try {
      const resp = await fetch(
        `${GEMINI_API_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: body.systemInstruction,
            contents: body.contents,
            generationConfig: body.generationConfig,
          }),
        },
      );

      if (!resp.ok) {
        const errText = await resp.text();
        return reply.status(resp.status).send({ error: errText.slice(0, 500) });
      }

      const data = await resp.json();
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Gemini proxy error: ${msg}` });
    }
  });
}
