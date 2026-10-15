export function GET() {
  const app = process.env.APP_PUBLIC_URL;
  const supabase = process.env.FRENGLE_SUPABASE_URL;
  if (!app || !supabase)
    return Response.json(
      { error: "MCP configuration required" },
      { status: 503 },
    );
  return Response.json({
    resource: `${app.replace(/\/$/, "")}/mcp/frengle`,
    authorization_servers: [`${supabase.replace(/\/$/, "")}/auth/v1`],
    bearer_methods_supported: ["header"],
  });
}
