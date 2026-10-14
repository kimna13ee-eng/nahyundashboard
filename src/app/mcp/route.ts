import { createClient } from "@supabase/supabase-js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { automationMcp } from "@/lib/automation-mcp";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const app = process.env.APP_PUBLIC_URL?.replace(/\/$/, "");
  const url = process.env.PERSONAL_SUPABASE_URL;
  const key = process.env.PERSONAL_SUPABASE_PUBLISHABLE_KEY;
  if (!app || !url || !key)
    return Response.json(
      { error: "MCP configuration required" },
      { status: 503 },
    );
  const origin = request.headers.get("origin");
  if (
    origin &&
    ![app, "https://chatgpt.com", "https://chat.openai.com"].includes(origin)
  )
    return new Response(null, { status: 403 });
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const unauthorized = () =>
    new Response(null, {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${app}/.well-known/oauth-protected-resource/mcp"`,
      },
    });
  if (!token) return unauthorized();
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const claims = await client.auth.getClaims(token);
  const user = await client.auth.getUser(token);
  if (claims.error || user.error || !user.data.user) return unauthorized();
  if (!process.env.PERSONAL_MCP_CLIENT_ID)
    return Response.json(
      { error: "Approved OAuth client required" },
      { status: 503 },
    );
  if (claims.data?.claims.client_id !== process.env.PERSONAL_MCP_CLIENT_ID)
    return new Response(null, { status: 403 });
  const payload = await request.text();
  if (new TextEncoder().encode(payload).length > 128000)
    return new Response(null, { status: 413 });
  let parsedBody;
  try {
    parsedBody = JSON.parse(payload);
  } catch {
    return new Response(null, { status: 400 });
  }
  const server = automationMcp(client, user.data.user.id);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { parsedBody });
  } finally {
    await server.close();
  }
}
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
