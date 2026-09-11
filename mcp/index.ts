import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";

dotenv.config();

const server = new Server(
  {
    name: "bankrock-oracle-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "explain_recent_fees",
        description: "Retrieves and decodes recent on-chain events and logs to explain where a user's funds went.",
        inputSchema: {
          type: "object",
          properties: {
            rockId: { type: "string" },
          },
          required: ["rockId"],
        },
      },
      {
        name: "simulate_cross_chain_intent",
        description: "Calculates fees and routing to fund the rock from another L2.",
        inputSchema: {
          type: "object",
          properties: {
            rockId: { type: "string" },
            sourceChain: { type: "string" },
            amount: { type: "number" },
          },
          required: ["rockId", "sourceChain", "amount"],
        },
      },
      {
        name: "optimize_idle_yield",
        description: "Analyzes Aave/Morpho rates and suggests yield allocation strategies for the rock's idle capital.",
        inputSchema: {
          type: "object",
          properties: {
            rockId: { type: "string" },
          },
          required: ["rockId"],
        },
      },
      {
        name: "generate_agentic_strategy",
        description: "Dynamically calculates optimal Aqua strategy parameters based on a natural-language risk assessment.",
        inputSchema: {
          type: "object",
          properties: {
            rockId: { type: "string" },
            riskProfile: { type: "string" },
          },
          required: ["rockId", "riskProfile"],
        },
      }
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "explain_recent_fees") {
      // Mock implementation
      return {
        content: [{ type: "text", text: `Mock: Rock ${args?.rockId} spent 2.5 USDC on bridging fees to Optimism and 0.5 USDC on Paymaster gas sponsorship.` }],
      };
    } else if (name === "simulate_cross_chain_intent") {
      // Mock implementation
      return {
        content: [{ type: "text", text: `Mock: To fund ${args?.amount} on Rock ${args?.rockId} from ${args?.sourceChain}, the estimated bridge fee is 1.2 USDC taking approx 2 minutes via LayerZero.` }],
      };
    } else if (name === "optimize_idle_yield") {
      // Mock implementation
      return {
        content: [{ type: "text", text: `Mock: Rock ${args?.rockId} has 500 idle USDC. Aave v3 on Base currently offers 8.5% APY. Recommend depositing.` }],
      };
    } else if (name === "generate_agentic_strategy") {
      // Mock implementation
      return {
        content: [{ type: "text", text: `Mock: Based on risk profile "${args?.riskProfile}", generated an Aqua Strategy for Rock ${args?.rockId} with 0.3% base fee and ±5% bounds.` }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bank Rock Oracle MCP Server running on stdio");
}

main().catch(console.error);
