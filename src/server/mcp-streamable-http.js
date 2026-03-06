#!/usr/bin/env node
import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getAllActivities } from "../tools/todoist/activities.js";
import { fetchOutlook, parseOutlook, formatOutput } from "../tools/weather/parse_spc_outlook.js";

// In-memory sessions: fine for learning / single instance.
// For real hosting behind a load balancer, use sticky sessions or a shared store.
const sessions = new Map(); // sessionId -> { transport, server }

function createMcpServer() {
  const server = new McpServer({
    name: "hello-world-mcp-server",
    version: "1.0.0",
  });

  // ✅ Recommended API: registerTool
  // The schema is Zod-based in many SDK versions; if your version supports raw JSON schema,
  // keep {} as "no params". If it expects Zod, see the note below.
  server.registerTool(
    "hello_world",
    {
      description: "Returns a Hello World message",
      // paramsSchema: ... (depends on your SDK version)
    },
    async (_args, _ctx) => {
      return {
        content: [{ type: "text", text: "Hello World!" }],
      };
    }
  );

  server.registerTool(
    "todoist_get_activities",
    {
      description: "Fetch Todoist activity events with optional filtering",
      inputSchema: z.object({
        limit: z.number().default(50).describe("Maximum number of activities per page"),
        eventTypeFilter: z.string().default("completed").describe("Filter by event type (use empty string for all events)"),
        maxPages: z.number().nullable().default(null).describe("Maximum number of pages to fetch (null for all pages)")
      })
    },
    async (args, _ctx) => {
      try {
        const token = "92c8e007bc150489a9b8f7b739f626fc9a50a303";
        const limit = args.limit || 50;
        const eventTypeFilter = args.eventTypeFilter === "" ? null : (args.eventTypeFilter || "completed");
        const maxPages = args.maxPages || null;

        const activities = await getAllActivities(token, limit, eventTypeFilter, maxPages);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: activities.length,
                activities: activities
              })
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching Todoist activities: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "weather_spc_outlook",
    {
      description: "Parse NOAA Storm Prediction Center Day 2 Convective Outlook. Returns structured severe weather forecast data including risk areas, threats, and geographic discussion",
      inputSchema: z.object({
        url: z.string().default("https://www.spc.noaa.gov/products/outlook/day2otlk.html").describe("URL of the SPC outlook page to parse"),
        format: z.enum(["human", "json"]).default("json").describe("Output format: 'human' for readable text or 'json' for structured data")
      })
    },
    async (args, _ctx) => {
      try {
        const url = args.url || "https://www.spc.noaa.gov/products/outlook/day2otlk.html";
        const format = args.format || "json";

        const html = await fetchOutlook(url);
        const data = parseOutlook(html);
        const output = formatOutput(data, format);

        return {
          content: [
            {
              type: "text",
              text: format === "json" ? output : output
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching SPC outlook: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  return server;
}

async function main() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // POST /mcp: initialize + requests
  app.post("/mcp", async (req, res) => {
    try {
      const header = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(header) ? header[0] : header;

      // Existing session
      if (sessionId && sessions.has(sessionId)) {
        const { transport } = sessions.get(sessionId);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // New session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, { transport, server });
        },
        // keep true in prod; disable only for certain local tooling if needed
        enableDnsRebindingProtection: true,
      });

      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) sessions.delete(id);
      };

      const server = createMcpServer();
      await server.connect(transport);

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("POST /mcp error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: req.body?.id ?? null,
        });
      }
    }
  });

  // GET /mcp: server->client stream for an existing session (optional but supported)
  app.get("/mcp", async (req, res) => {
    const header = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(header) ? header[0] : header;

    if (!sessionId) return res.status(400).send("Missing mcp-session-id header");
    const entry = sessions.get(sessionId);
    if (!entry) return res.status(400).send("Invalid or expired session");

    await entry.transport.handleRequest(req, res);
  });

  // DELETE /mcp: end an existing session
  app.delete("/mcp", async (req, res) => {
    const header = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(header) ? header[0] : header;

    if (!sessionId) return res.status(400).send("Missing mcp-session-id header");
    const entry = sessions.get(sessionId);
    if (!entry) return res.status(400).send("Invalid or expired session");

    await entry.transport.handleRequest(req, res);
  });

  app.get("/healthz", (_req, res) => res.status(200).send("ok"));

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`✅ Hosted MCP (Streamable HTTP) listening on http://localhost:${port}/mcp`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});