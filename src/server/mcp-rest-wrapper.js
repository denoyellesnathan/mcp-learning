#!/usr/bin/env node
/**
 * REST API wrapper around the MCP Streamable HTTP server.
 *
 * Exposes plain JSON endpoints so clients that don't speak MCP natively
 * (e.g. OpenClaw) can discover and invoke MCP tools over regular HTTP.
 *
 * Endpoints:
 *   GET  /api/tools            – list available MCP tools
 *   POST /api/tools/:toolName  – call a tool  { "arguments": { ... } }
 *   GET  /healthz              – liveness check
 *
 * Environment variables:
 *   MCP_SERVER_URL  – upstream MCP server (default: http://localhost:3000/mcp)
 *   WRAPPER_PORT    – port for this wrapper   (default: 4000)
 */
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:3000/mcp";
const WRAPPER_PORT = Number(process.env.WRAPPER_PORT ?? 4000);

let mcpClient = null;
let cachedTools = null;

async function ensureConnected() {
  if (mcpClient) return;

  mcpClient = new Client(
    { name: "mcp-rest-wrapper", version: "1.0.0" },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
  await mcpClient.connect(transport);
  console.log(`✅ Connected to MCP server at ${MCP_SERVER_URL}`);
}

async function listTools() {
  await ensureConnected();
  if (!cachedTools) {
    const result = await mcpClient.listTools();
    cachedTools = result.tools;
  }
  return cachedTools;
}

async function callTool(name, args = {}) {
  await ensureConnected();
  return mcpClient.callTool({ name, arguments: args });
}

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "1mb" }));

// List all available MCP tools
app.get("/api/tools", async (_req, res) => {
  try {
    const tools = await listTools();
    const payload = tools.map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema || { type: "object", properties: {} },
    }));
    res.json({ tools: payload });
  } catch (err) {
    console.error("GET /api/tools error:", err);
    res.status(502).json({ error: "Failed to list tools from MCP server" });
  }
});

// Call a specific MCP tool by name
app.post("/api/tools/:toolName", async (req, res) => {
  const { toolName } = req.params;
  const args = {
    ...req.query,
    ...req.body.arguments ?? req.body ?? {}
  };

  try {
    const result = await callTool(toolName, args);
    return res.json(JSON.parse(result.content?.[0]?.text) ?? "");
  } catch (err) {
    console.error(`POST /api/tools/${toolName} error:`, err);
    const status = err.message?.includes("not found") ? 404 : 502;
    res.status(status).json({ error: err.message || "Tool call failed" });
  }
});

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.listen(WRAPPER_PORT, () => {
  console.log(`🌐 MCP REST wrapper listening on http://localhost:${WRAPPER_PORT}`);
  console.log(`   Upstream MCP server: ${MCP_SERVER_URL}`);
});
