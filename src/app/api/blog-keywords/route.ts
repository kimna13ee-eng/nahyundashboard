import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import {
  workspaceSession,
  WorkspaceAccessError,
} from "@/lib/workspaces/server";
import {
  BlogKeywordInputError,
  blogKeywordColumns,
  blogKeywordLimit,
  blogKeywordQueryAllowed,
  parseBlogKeywordMutation,
  publicBlogKeyword,
  type BlogKeyword,
} from "@/lib/blog-keywords";

const table = "ops_blog_keywords";
const conflict = () =>
  json(
    {
      conflict: true,
      error:
        "다른 화면에서 키워드가 바뀌었어요. 목록을 새로 불러온 뒤 다시 시도해 주세요.",
    },
    409,
  );
function failure(error?: { code?: string } | null) {
  if (error?.code === "40001") return conflict();
  if (
    ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
      error?.code || "",
    )
  )
    return json(
      {
        ready: false,
        setupRequired: true,
        error:
          "블로그 소재 저장소를 준비 중이에요. 설정 완료 후 다시 시도해 주세요.",
      },
      503,
    );
  if (error?.code === "42501")
    return json({ error: "블로그 소재에 접근할 권한이 없어요." }, 403);
  if (["23514", "23502", "22P02", "22007", "22023"].includes(error?.code || ""))
    return json({ error: "키워드 내용과 선택한 항목을 확인해 주세요." }, 400);
  return json(
    {
      ready: false,
      error:
        "블로그 소재를 저장소에서 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
    },
    503,
  );
}
async function handle(req: NextRequest) {
  if (req.method !== "GET" && !sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (!blogKeywordQueryAllowed(req.nextUrl.searchParams))
    return json(
      { error: "블로그 소재는 PERSONAL에서만 사용할 수 있어요." },
      403,
    );
  try {
    const { client, user } = await workspaceSession(
      new URLSearchParams({ workspace: "PERSONAL" }),
    );
    if (req.method === "GET") {
      const result = await client
        .from(table)
        .select(blogKeywordColumns, { count: "exact" })
        .eq("owner_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(blogKeywordLimit + 1);
      if (result.error) return failure(result.error);
      return json({
        items: (result.data || []).slice(0, blogKeywordLimit),
        truncated:
          (result.count || 0) > blogKeywordLimit ||
          (result.data?.length || 0) > blogKeywordLimit,
      });
    }
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 128_000)
      return json(
        { error: "키워드 입력이 너무 커요. 선택한 항목을 줄여 주세요." },
        413,
      );
    const value = parseBlogKeywordMutation(JSON.parse(raw), req.method);
    if (value.action === "create") {
      const result = await client
        .from(table)
        .insert({ id: value.id, keyword: value.keyword })
        .select(blogKeywordColumns)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (result.error?.code === "23505") {
        const existing = await client
          .from(table)
          .select(blogKeywordColumns)
          .eq("id", value.id)
          .eq("owner_id", user.id)
          .maybeSingle();
        if (existing.error) return failure(existing.error);
        // A lost create response may be retried, but may never undo a later check/delete.
        return existing.data &&
          existing.data.keyword === value.keyword &&
          !existing.data.used &&
          !existing.data.deleted_at
          ? json({ item: existing.data })
          : conflict();
      }
      return result.error || !result.data
        ? failure(result.error)
        : json({ item: result.data }, 201);
    }
    if (value.action === "update") {
      const result = await client
        .from(table)
        .update({ used: value.used })
        .eq("id", value.id)
        .eq("owner_id", user.id)
        .eq("updated_at", value.expectedUpdatedAt)
        .is("deleted_at", null)
        .select(blogKeywordColumns)
        .maybeSingle();
      return result.error
        ? failure(result.error)
        : result.data
          ? json({ item: result.data })
          : conflict();
    }
    const result = await client.rpc("ops_blog_keywords_set_deleted", {
      p_items: value.items,
      p_deleted: value.action === "delete",
    });
    if (result.error) return failure(result.error);
    return json({
      items: ((result.data || []) as BlogKeyword[]).map(publicBlogKeyword),
    });
  } catch (error) {
    if (error instanceof WorkspaceAccessError)
      return json({ error: error.message }, error.status);
    if (error instanceof BlogKeywordInputError)
      return json({ error: error.message }, 400);
    if (error instanceof SyntaxError)
      return json({ error: "키워드 입력 형식을 확인해 주세요." }, 400);
    return failure();
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
