# Hello World MCP Server

A learning project for the [Model Context Protocol](https://modelcontextprotocol.io) using the TypeScript SDK (`@modelcontextprotocol/sdk` v1.27.x). Demonstrates two transport modes with a single `hello_world` tool.

## Setup

```bash
npm install
```

## Transport Modes

### stdio — local / process-spawned

The client spawns the server as a subprocess and communicates over stdin/stdout. Best for local dev and desktop app integrations (e.g. Kiro, Claude Desktop).

```bash
npm start
```

To wire it into Kiro, add to `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "hello-world": {
      "command": "node",
      "args": ["<absolute-path>/src/mcp-stdio.js"],
      "disabled": false
    }
  }
}
```

### Streamable HTTP — remote / hosted

An Express server exposing the MCP protocol over HTTP with session management. Best for shared or cloud deployments.

```bash
npm run start:hosted
```

Listens on `http://localhost:3000/mcp` (override with `PORT` env var).

Endpoints:
- `POST /mcp` — initialize session + send requests
- `GET  /mcp` — server→client SSE stream (existing session)
- `DELETE /mcp` — end session
- `GET  /healthz` — health check

### Test client

A small script that connects to the hosted server, lists tools, and calls `hello_world`:

```bash
# start the hosted server first, then in another terminal:
node test-streamable-http.js
```

## Project Structure

```
src/
  mcp-stdio.js             # stdio transport (McpServer)
  mcp-streamable-http.js   # Streamable HTTP transport (McpServer + Express)
test-streamable-http.js    # test client for the hosted server
```

## SDK Reference

Both servers use the high-level `McpServer` API from `@modelcontextprotocol/sdk/server/mcp.js`. Key concepts:

- `server.registerTool(name, config, handler)` — register a tool (capabilities auto-declared)
- `server.registerResource(name, uri, config, handler)` — expose read-only data
- `server.registerPrompt(name, config, handler)` — reusable prompt templates
- `server.connect(transport)` — bind to a transport and start serving

Docs: https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x
