import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    // Retirement must not revive authentication, database access, or MCP tools.
    if (
      /supabase|modelcontextprotocol|automation-mcp/.test(specifier)
    ) {
      throw new Error(`Retired integration loaded an active dependency: ${specifier}`);
    }
    if (specifier.startsWith("@/"))
      return nextResolve(
        pathToFileURL(resolve("src", `${specifier.slice(2)}.ts`)).href,
        context,
      );
    return nextResolve(specifier, context);
  },
});
after(() => hooks.deregister());

const routes = [
  ["../src/app/mcp/route.ts", ["GET", "POST"]],
  ["../src/app/mcp/frengle/route.ts", ["GET", "POST"]],
  ["../src/app/api/mcp-consent/route.ts", ["GET", "POST"]],
  ["../src/app/api/frengle/mcp-consent/route.ts", ["GET", "POST"]],
  ["../src/app/api/automation-results/route.ts", ["GET"]],
  ["../src/app/api/frengle/results/route.ts", ["GET"]],
  ["../src/app/.well-known/oauth-protected-resource/mcp/route.ts", ["GET"]],
  ["../src/app/.well-known/oauth-protected-resource/mcp/frengle/route.ts", ["GET"]],
] as const;

test("retired GPT endpoints reject existing clients without network or data access", async (context) => {
  context.mock.method(globalThis, "fetch", () => {
    throw new Error("Retired integration attempted a network request");
  });
  for (const [path, methods] of routes) {
    const route = await import(path);
    for (const method of methods) {
      const response = await route[method](
        new Request("https://dashboard.example.invalid/?authorization_id=old-request", {
          method,
          headers: { Authorization: "Bearer previously-approved-client" },
          ...(method === "POST"
            ? { body: JSON.stringify({ approve: true, method: "tools/call" }) }
            : {}),
        }),
      );
      assert.equal(response.status, 410, `${method} ${path}`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("www-authenticate"), null);
      assert.deepEqual(await response.json(), {
        error: "대시보드의 GPT 자동화 연결이 종료되었습니다.",
        code: "AUTOMATION_RETIRED",
      });
    }
  }
});
