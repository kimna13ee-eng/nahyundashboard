import { NextRequest } from "next/server";
import { blogKeywordCsv } from "@/lib/blog-keyword-csv";
import { blogKeywordQueryAllowed } from "@/lib/blog-keywords";
import { json, sameOrigin } from "@/lib/http";
import {
  workspaceSession,
  WorkspaceAccessError,
} from "@/lib/workspaces/server";

function failure(code?: string) {
  if (code === "40001")
    return json(
      {
        conflict: true,
        error:
          "소재 목록이 바뀌었어요. 새 목록을 확인한 뒤 다시 진행해 주세요.",
      },
      409,
    );
  if (code === "42501")
    return json({ error: "블로그 소재에 접근할 권한이 없어요." }, 403);
  return json(
    {
      error:
        "블로그 소재 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    },
    503,
  );
}

async function handle(req: NextRequest) {
  const query = new URLSearchParams(req.nextUrl.searchParams);
  const formats = query.getAll("format");
  query.delete("format");
  if (
    !blogKeywordQueryAllowed(query) ||
    (req.method !== "GET" && !sameOrigin(req))
  )
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (
    formats.length &&
    (formats.length !== 1 || formats[0] !== "csv" || req.method !== "GET")
  )
    return json({ error: "요청한 내보내기 형식을 확인해 주세요." }, 400);
  try {
    const { client } = await workspaceSession(
      new URLSearchParams({ workspace: "PERSONAL" }),
    );
    if (req.method === "GET") {
      const csv = formats.length === 1;
      const { data, error } = await client.rpc("ops_blog_keyword_archive", {
        p_action: csv ? "export" : "summary",
      });
      if (error || !data) return failure(error?.code);
      if (!csv) return json({ count: data.count, snapshot: data.snapshot });
      if (!Array.isArray(data.items) || data.items.length !== data.count)
        return failure();
      const date = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
      }).format(new Date());
      const headers = new Headers({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="blog-topics-${date}.csv"; filename*=UTF-8''${encodeURIComponent(`블로그-소재-${date}.csv`)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Archive-Count": String(data.count),
        "X-Archive-Snapshot": data.snapshot,
      });
      if (data.items.length)
        headers.set("X-Archive-Newest-Created-At", data.items[0].created_at);
      return new Response(blogKeywordCsv(data.items), { headers });
    }
    const body = await req.text();
    if (body.length > 256)
      return json({ error: "요청 내용이 너무 커요." }, 413);
    const value = JSON.parse(body);
    if (!value || typeof value !== "object" || Object.keys(value).length !== 1)
      return json({ error: "대상 소재 목록을 확인해 주세요." }, 400);
    if (req.method === "DELETE") {
      if (
        typeof value.snapshot !== "string" ||
        !/^[0-9a-f]{64}$/.test(value.snapshot)
      )
        return json({ error: "삭제할 목록을 다시 확인해 주세요." }, 400);
      const { data, error } = await client.rpc("ops_blog_keyword_archive", {
        p_action: "clear",
        p_snapshot: value.snapshot,
      });
      return error || !data
        ? failure(error?.code)
        : json({ count: data.count, batchId: data.batchId });
    }
    if (
      typeof value.batchId !== "string" ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.batchId)
    )
      return json({ error: "되돌릴 목록을 다시 확인해 주세요." }, 400);
    const { data, error } = await client.rpc(
      "ops_blog_keyword_archive_restore",
      { p_batch: value.batchId },
    );
    return error ? failure(error.code) : json({ count: data });
  } catch (error) {
    if (error instanceof WorkspaceAccessError)
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return json({ error: "요청 형식을 확인해 주세요." }, 400);
    return failure();
  }
}

export const GET = handle;
export const DELETE = handle;
export const POST = handle;
