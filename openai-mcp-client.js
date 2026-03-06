#!/usr/bin/env node
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:3000/mcp";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function main() {
  console.log("🚀 Starting OpenAI + MCP integration...\n");

  // Connect to MCP server using the SDK client
  const mcpClient = new Client(
    { name: "openai-mcp-client", version: "1.0.0" },
    { capabilities: {} }
  );
  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
  await mcpClient.connect(transport);
  console.log("✅ Connected to MCP server");

  // Discover available tools
  const { tools } = await mcpClient.listTools();
  console.log("📋 Available MCP tools:", tools.map(t => t.name).join(", "), "\n");

  // Convert MCP tools to OpenAI function format
  const openaiTools = tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.inputSchema || { type: "object", properties: {} },
    },
  }));

  // Chat with OpenAI using the MCP tools
  const messages = [
    { role: "system", content: "You are a helpful assistant with access to MCP tools. Use them when appropriate." },
    { role: "user", content: "Can you greet me using the hello_world tool?" },
  ];

  console.log("💬 User: Can you greet me using the hello_world tool?\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    tools: openaiTools,
    tool_choice: "auto",
  });

  const assistantMessage = response.choices[0].message;
  messages.push(assistantMessage);

  if (assistantMessage.tool_calls) {
    console.log("🔧 Assistant wants to call tools:");

    for (const toolCall of assistantMessage.tool_calls) {
      console.log(`   - ${toolCall.function.name}(${toolCall.function.arguments})`);

      const args = JSON.parse(toolCall.function.arguments);
      const result = await mcpClient.callTool({ name: toolCall.function.name, arguments: args });

      console.log(`   ✅ Result:`, result.content[0].text);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result.content[0]),
      });
    }

    console.log();

    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
    });

    console.log("🤖 Assistant:", finalResponse.choices[0].message.content);
  } else {
    console.log("🤖 Assistant:", assistantMessage.content);
  }

  await mcpClient.close();
  console.log("\n✅ Done!");
}

main().catch(console.error);
