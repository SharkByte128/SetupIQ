import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { startNltPoller, stopNltPoller, triggerNltPoller, getNltPollerStatus } from "../timing-poller.js";

export async function registerNltPollerRoutes(app: FastifyInstance): Promise<void> {
  // Start the NLT poller for a race URL + racer
  app.post<{
    Body: {
      raceUrl: string;
      racerName: string;
      carId: string;
      setupSnapshotId?: string;
    };
  }>("/api/nlt/poller/start", {
    schema: {
      body: {
        type: "object",
        required: ["raceUrl", "racerName", "carId"],
        properties: {
          raceUrl: { type: "string" },
          racerName: { type: "string" },
          carId: { type: "string" },
          setupSnapshotId: { type: "string" },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: { raceUrl: string; racerName: string; carId: string; setupSnapshotId?: string } }>, reply: FastifyReply) => {
    const { raceUrl, racerName, carId, setupSnapshotId } = request.body;

    // Validate URL is from nextleveltiming.com
    let parsed: URL;
    try {
      parsed = new URL(raceUrl);
    } catch {
      return reply.status(400).send({ error: "Invalid URL" });
    }
    if (parsed.hostname !== "nextleveltiming.com" && parsed.hostname !== "www.nextleveltiming.com") {
      return reply.status(400).send({ error: "URL must be from nextleveltiming.com" });
    }

    // Extract userId from JWT (auth required)
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    startNltPoller({ raceUrl, racerName, carId, setupSnapshotId, userId });
    return { status: "started", raceUrl, racerName };
  });

  // Stop the poller
  app.post("/api/nlt/poller/stop", async (_request: FastifyRequest, reply: FastifyReply) => {
    stopNltPoller();
    return { status: "stopped" };
  });

  // Wake the poller from snooze
  app.post("/api/nlt/poller/trigger", async (_request: FastifyRequest, reply: FastifyReply) => {
    const resumed = triggerNltPoller();
    if (!resumed) {
      return reply.status(404).send({ error: "No poller is configured. Start one first." });
    }
    return { status: "triggered" };
  });

  // Get poller status
  app.get("/api/nlt/poller/status", async () => {
    return getNltPollerStatus();
  });
}
