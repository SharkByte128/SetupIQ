import type { FastifyInstance } from "fastify";
import {
  generateRuleRecommendations,
  buildRecommendationPrompt,
  getCarById,
  type RecommendationContext,
  type Recommendation,
  type SetupChange,
  type RecommendationPriority,
} from "@setupiq/shared";
import { randomUUID } from "node:crypto";

/**
 * POST /api/recommendations
 * Body: RecommendationContext
 * Returns: Recommendation[]
 *
 * Strategy:
 * 1. Always generate rule-based recommendations first (instant, no external deps)
 * 2. If OLLAMA_URL or OPENAI_API_KEY is set, also query LLM for additional suggestions
 * 3. Merge and return deduplicated list
 */
export async function registerRecommendationRoutes(
  app: FastifyInstance
): Promise<void> {
  app.post<{ Body: RecommendationContext }>(
    "/api/recommendations",
    async (request, reply) => {
      const ctx = request.body;

      if (!ctx?.car?.id || !ctx.currentSetup) {
        return reply.status(400).send({ error: "Invalid recommendation context" });
      }

      const car = getCarById(ctx.car.id);
      if (!car) {
        return reply.status(404).send({ error: `Car not found: ${ctx.car.id}` });
      }

      const now = new Date().toISOString();
      const recommendations: Recommendation[] = [];

      // ── Rule-based ──
      const ruleResults = generateRuleRecommendations(ctx, car);
      for (const r of ruleResults) {
        recommendations.push({
          id: randomUUID(),
          sessionId: ctx.recentSessions[0]?.sessionId ?? "",
          source: "rule",
          priority: r.priority,
          title: r.title,
          reasoning: r.reasoning,
          changes: r.changes,
          status: "pending",
          createdAt: now,
        });
      }

      // ── LLM-based (optional) ──
      const ollamaUrl = process.env.OLLAMA_URL;
      const openaiKey = process.env.OPENAI_API_KEY;

      if (ollamaUrl || openaiKey) {
        try {
          const prompt = buildRecommendationPrompt(ctx);
          const llmResults = ollamaUrl
            ? await queryOllama(ollamaUrl, prompt)
            : await queryOpenAI(openaiKey!, prompt);

          for (const r of llmResults) {
            // Skip if rule engine already suggests the same thing
            const isDupe = recommendations.some(
              (existing) =>
                existing.changes.some((ec) =>
                  r.changes.some(
                    (lc) =>
                      lc.capabilityId === ec.capabilityId &&
                      lc.suggestedValue === ec.suggestedValue
                  )
                )
            );
            if (isDupe) continue;

            recommendations.push({
              id: randomUUID(),
              sessionId: ctx.recentSessions[0]?.sessionId ?? "",
              source: "llm",
              priority: r.priority,
              title: r.title,
              reasoning: r.reasoning,
              changes: r.changes,
              status: "pending",
              createdAt: now,
            });
          }
        } catch (err) {
          app.log.warn({ err }, "LLM recommendation query failed, using rules only");
        }
      }

      return recommendations;
    }
  );
}

// ─── LLM Adapters ─────────────────────────────────────────────

interface LLMSuggestion {
  title: string;
  reasoning: string;
  priority: RecommendationPriority;
  changes: SetupChange[];
}

const SYSTEM_PROMPT = `You are an expert RC car setup tuner specializing in 1:28 scale Mini-Z and similar cars.
Given a car's current setup, handling feedback, and lap data, suggest specific setup changes.
Return a JSON array of objects with these fields:
- title: short description of the change
- reasoning: explain why this helps
- priority: "high", "medium", or "low"
- changes: array of { capabilityId, capabilityName, currentValue, suggestedValue }
Return ONLY valid JSON, no markdown fences or extra text.`;

async function queryOllama(
  baseUrl: string,
  prompt: string
): Promise<LLMSuggestion[]> {
  const model = process.env.OLLAMA_MODEL || "llama3";
  const resp = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      system: SYSTEM_PROMPT,
      prompt,
      stream: false,
      format: "json",
    }),
  });

  if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
  const data = (await resp.json()) as { response: string };
  return parseLLMResponse(data.response);
}

async function queryOpenAI(
  apiKey: string,
  prompt: string
): Promise<LLMSuggestion[]> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status}`);
  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return parseLLMResponse(data.choices[0].message.content);
}

function parseLLMResponse(raw: string): LLMSuggestion[] {
  const parsed = JSON.parse(raw);
  // Handle both direct array and { suggestions: [...] } wrapper
  const arr = Array.isArray(parsed) ? parsed : parsed.suggestions ?? parsed.recommendations ?? [];
  if (!Array.isArray(arr)) return [];

  return arr
    .filter(
      (item: Record<string, unknown>) =>
        typeof item.title === "string" &&
        typeof item.reasoning === "string" &&
        Array.isArray(item.changes)
    )
    .map((item: Record<string, unknown>) => ({
      title: item.title as string,
      reasoning: item.reasoning as string,
      priority: (["high", "medium", "low"].includes(item.priority as string)
        ? item.priority
        : "medium") as RecommendationPriority,
      changes: (item.changes as SetupChange[]).map((c) => ({
        capabilityId: String(c.capabilityId),
        capabilityName: String(c.capabilityName ?? c.capabilityId),
        currentValue: c.currentValue ?? "",
        suggestedValue: c.suggestedValue ?? "",
      })),
    }));
}
