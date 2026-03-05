#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
);

// Point to the /mcp endpoint instead of /sse
const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3000/mcp")
);

await client.connect(transport);

console.log("✅ Connected to MCP server\n");

const { tools } = await client.listTools();
console.log("📋 Available tools:", tools.map(t => t.name));

const result = await client.callTool({
    name: "hello_world",
    arguments: {}
});

console.log("🎉 Result:", result.content[0].text);

await client.close();

console.log("\n✅ Done!");