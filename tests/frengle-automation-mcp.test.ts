import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { frengleAutomationMcp } from "../src/lib/frengle-automation-mcp.ts";
test("MCP 초기화·도구 목록·회사 결과 저장 및 잘못된 원본 거부", async () => {
  let stored: Record<string, unknown> | undefined;
  const db = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        stored = row;
        return {
          select: () => ({
            single: async () => ({
              data: { id: "result-1", received_at: "2026-10-14T00:00Z" },
              error: null,
            }),
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;
  const server = frengleAutomationMcp(db, "owner");
  const client = new Client({ name: "test", version: "1.0.0" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(left);
  await client.connect(right);
  try {
    const list = await client.listTools();
    assert.deepEqual(list.tools.map((t) => t.name).sort(), [
      "list_frengle_results",
      "save_frengle_result",
    ]);
    const args = {
      source: "frengle_keywords",
      run_key: "run1",
      title: "회사 결과",
      body: "본문",
      source_url: "https://chatgpt.com/c/test",
      reported_at: "2026-10-14T09:00:00+09:00",
    };
    const result = await client.callTool({
      name: "save_frengle_result",
      arguments: args,
    });
    assert.notEqual(result.isError, true);
    assert.equal(stored?.owner_id, "owner");
    assert.equal(stored?.source, "frengle_keywords");
    const work = await client.callTool({
      name: "save_frengle_result",
      arguments: { ...args, source: "frengle_work_check", run_key: "work1" },
    });
    assert.notEqual(work.isError, true);
    assert.equal(stored?.source, "frengle_work_check");
    const wrongSource = await client.callTool({
      name: "save_frengle_result",
      arguments: { ...args, source: "metricool_personal" },
    });
    assert.equal(wrongSource.isError, true);
    const invalid = await client.callTool({
      name: "save_frengle_result",
      arguments: { ...args, source_url: "https://evil.test/c/test" },
    });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
