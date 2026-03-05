#!/usr/bin/env node
import express from "express";
import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

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