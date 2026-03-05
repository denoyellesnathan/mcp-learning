#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "hello-world-mcp-server",
  version: "1.0.0",
});

server.registerTool("hello_world", {
  description: "Returns a Hello World message",
}, async () => ({
  content: [{ type: "text", text: "Hello World!" }],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hello World MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
