import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAutomationResult } from "./automation-result.ts";

export function frengleAutomationMcp(client: SupabaseClient, ownerId: string) {
  const server = new McpServer({
    name: "my-ops-frengle-results",
    version: "1.0.0",
  });
  server.registerTool(
    "save_frengle_result",
    {
      title: "FRENGLE 자동화 결과 저장",
      description:
        "FRENGLE 키워드 검색·사이트 추천·출근 업무 체크 결과를 회사 저장소에 저장합니다. PERSONAL Metricool은 받지 않습니다. 같은 실행의 재시도에는 같은 run_key를 사용하세요.",
      inputSchema: {
        source: z.enum(["frengle_keywords", "frengle_site_recommendations", "frengle_work_check"]),
        run_key: z.string().min(1).max(160),
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(50000),
        source_url: z.string().url(),
        reported_at: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const common = parseAutomationResult({
          ...input,
          source: "metricool_personal",
        });
        const value = { ...common, source: input.source };
        const result = await client
          .from("ops_automation_results")
          .insert({ ...value, owner_id: ownerId })
          .select("id,received_at")
          .single();
        if (result.error?.code === "23505") {
          const previous = await client
            .from("ops_automation_results")
            .select("id,received_at,title,body,source_url,reported_at")
            .eq("owner_id", ownerId)
            .eq("source", value.source)
            .eq("run_key", value.run_key)
            .single();
          if (previous.error || !previous.data)
            throw new Error("저장 상태 확인 실패");
          if (
            previous.data.title !== value.title ||
            previous.data.body !== value.body ||
            previous.data.source_url !== value.source_url ||
            Date.parse(previous.data.reported_at) !==
              Date.parse(value.reported_at)
          )
            throw new Error(
              "같은 실행 키에 다른 결과가 있습니다. 기존 결과는 보존했습니다.",
            );
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: true,
                  id: previous.data.id,
                  received_at: previous.data.received_at,
                  duplicate: true,
                }),
              },
            ],
          };
        }
        if (result.error)
          throw new Error("결과 저장 실패. 저장소 연결을 확인해 주세요.");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, ...result.data }),
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: e instanceof Error ? e.message : "결과 저장 실패",
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    "list_frengle_results",
    {
      title: "FRENGLE 자동화 결과 조회",
      description:
        "현재 로그인한 사용자의 저장된 FRENGLE 자동화 결과를 최근순으로 조회합니다.",
      inputSchema: { limit: z.number().int().min(1).max(20).default(5) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ limit }) => {
      const r = await client
        .from("ops_automation_results")
        .select("*")
        .eq("owner_id", ownerId)
        .order("received_at", { ascending: false })
        .limit(limit);
      return {
        isError: Boolean(r.error),
        content: [
          {
            type: "text" as const,
            text: r.error ? "결과 조회 실패" : JSON.stringify(r.data),
          },
        ],
      };
    },
  );
  return server;
}
