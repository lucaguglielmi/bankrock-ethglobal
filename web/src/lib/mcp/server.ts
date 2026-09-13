/**
 * The hosted MCP server: Streamable HTTP, stateless, one `Server` per request.
 *
 * Why it exists at all. The stdio server in `mcp/` runs on a person's own machine, which a phone
 * cannot do: ChatGPT and the Claude apps connect to a *remote* MCP server over HTTPS from their
 * own cloud, and the client is configured with nothing but a URL. This module is that URL's
 * behaviour, mounted at `/api/mcp` inside the same Cloudflare Worker as the site (spec 11 §5
 * always said "hosted as part of our backend infrastructure"; this is the first time it was).
 *
 * Why stateless. A Worker isolate lives for one request and keeps nothing in memory between
 * requests, so a session id would name a session no isolate remembers. In stateless mode the
 * transport issues no `Mcp-Session-Id`, every POST carries a complete JSON-RPC exchange, and the
 * answer is a plain JSON body rather than an SSE stream (`enableJsonResponse`). Both ChatGPT
 * and Claude accept that; so do Claude Code, Cursor and the MCP Inspector.
 *
 * Why the cfworker validator. The SDK's default JSON-schema validator is Ajv, which compiles
 * schemas with `new Function`, and workerd forbids code generation. Nothing here validates a
 * schema today — no tool declares an output schema and nothing elicits — but the default is
 * swapped for the SDK's own eval-free provider so that day never becomes an outage.
 *
 * Read-only by decision (D-008, D-019). The server has no key and advertises only `tools`.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { appPath } from "@/lib/chain";
import { agentInstructions, MCP_ENDPOINT_PATH } from "./prompt";
import { callHostedTool, HOSTED_TOOLS } from "./tools";

export const HOSTED_SERVER_NAME = "bankrock-oracle-mcp";
export const HOSTED_SERVER_VERSION = "2.1.0";

/** A fresh server, wired to the hosted tools. Cheap: nothing is read until a tool is called. */
export function createHostedMcpServer(): Server {
  const server = new Server(
    { name: HOSTED_SERVER_NAME, version: HOSTED_SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions: agentInstructions(appPath(MCP_ENDPOINT_PATH)),
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: HOSTED_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callHostedTool(request.params.name, request.params.arguments),
  );

  return server;
}

/**
 * Answers one HTTP request to the endpoint.
 *
 * The transport validates the method, the `Accept` and `Content-Type` headers and the JSON-RPC
 * envelope itself, and answers a malformed request with the status and error the protocol
 * prescribes; this function never has to look inside the body.
 */
export async function handleMcpRequest(req: Request): Promise<Response> {
  const server = createHostedMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
