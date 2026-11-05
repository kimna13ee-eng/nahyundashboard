const assert = require("node:assert/strict");

(async () => {
  const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3003";
  const routes = [
    ["/mcp", ["GET", "POST"]],
    ["/mcp/frengle", ["GET", "POST"]],
    ["/api/mcp-consent?authorization_id=old-request", ["GET", "POST"]],
    ["/api/frengle/mcp-consent?authorization_id=old-request", ["GET", "POST"]],
    ["/api/automation-results", ["GET"]],
    ["/api/frengle/results", ["GET"]],
    ["/.well-known/oauth-protected-resource/mcp", ["GET"]],
    ["/.well-known/oauth-protected-resource/mcp/frengle", ["GET"]],
  ];
  for (const [path, methods] of routes) {
    for (const method of methods) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { Authorization: "Bearer retired-client", "Content-Type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ approve: true, method: "tools/call" }) } : {}),
      });
      assert.equal(response.status, 410, `${method} ${path}`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("www-authenticate"), null);
      assert.equal((await response.json()).code, "AUTOMATION_RETIRED");
    }
  }
  console.log("PASS: retired GPT endpoints deny results, tool calls, discovery and OAuth approval");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
