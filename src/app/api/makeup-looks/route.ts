import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import {
  allowedQuery,
  lookCategory,
  lookId,
  makeupError,
  MakeupInputError,
  makeupSession,
  monday,
  photoTable,
  picksTable,
  readMutation,
  readUpload,
} from "@/lib/makeup-looks-server";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    allowedQuery(params, ["week", "offset", "picked", "category"]);
    const week = monday(params.get("week"));
    const category = params.get("category");
    if (category !== "unclassified") lookCategory(category);
    const rawOffset = params.get("offset") ?? "0";
    const offset = Number(rawOffset);
    if (
      !/^(0|[1-9]\d*)$/.test(rawOffset) ||
      offset > 2147483647 ||
      (params.has("picked") &&
        !["true", "false"].includes(params.get("picked")!))
    )
      throw new MakeupInputError("목록의 조회 조건을 확인해 주세요.");
    const { client } = await makeupSession();
    const result = await client.rpc("ops_list_makeup_looks", {
      p_week: week,
      p_offset: offset,
      p_picked_only: params.get("picked") === "true",
      p_category: category,
    });
    if (result.error) return makeupError(result.error);
    const entries = result.data ?? [];
    return json({
      items: entries.slice(0, 40),
      nextOffset: entries.length > 40 ? offset + 40 : null,
    });
  } catch (error) {
    return makeupError(error);
  }
}

async function mutate(req: NextRequest) {
  if (!sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  try {
    allowedQuery(req.nextUrl.searchParams, []);
    const { client, user } = await makeupSession();
    if (req.method === "POST") {
      const value = await readUpload(req);
      const result = await client.rpc("ops_create_makeup_look", value).single();
      if (result.error || !result.data) return makeupError(result.error);
      return json({ item: result.data }, 201);
    }
    const deleting = req.method === "DELETE";
    const raw = await readMutation(
      req,
      deleting ? ["id", "ids"] : ["id", "week", "picked", "category"],
      deleting ? 1048576 : undefined,
    );
    if (deleting && Object.hasOwn(raw, "ids")) {
      if (
        Object.hasOwn(raw, "id") ||
        !Array.isArray(raw.ids) ||
        !raw.ids.length
      )
        throw new MakeupInputError("삭제할 사진을 선택해 주세요.");
      const ids = [...new Set(raw.ids.map(lookId))];
      const result = await client.rpc("ops_delete_selected_makeup_looks", {
        p_ids: ids,
      });
      return result.error
        ? makeupError(result.error)
        : json({ count: result.data });
    }
    const id = lookId(raw.id);
    if (deleting) {
      const result = await client
        .from(photoTable)
        .delete()
        .eq("owner_id", user.id)
        .eq("id", id);
      return result.error ? makeupError(result.error) : json({ id });
    }
    if (Object.hasOwn(raw, "category")) {
      if (Object.hasOwn(raw, "week") || Object.hasOwn(raw, "picked"))
        throw new MakeupInputError(
          "분류 변경과 주간 선택은 각각 저장해 주세요.",
        );
      const category = lookCategory(raw.category);
      const result = await client
        .from(photoTable)
        .update({ category })
        .eq("owner_id", user.id)
        .eq("id", id)
        .select("id,category")
        .maybeSingle();
      if (result.error) return makeupError(result.error);
      return result.data
        ? json(result.data)
        : json({ error: "사진을 찾을 수 없어요." }, 404);
    }
    const week = monday(raw.week);
    if (typeof raw.picked !== "boolean")
      throw new MakeupInputError("주간 선택을 확인해 주세요.");
    const result = raw.picked
      ? await client.from(picksTable).upsert(
          { look_id: id, week_start: week },
          {
            onConflict: "owner_id,week_start,look_id",
            ignoreDuplicates: true,
          },
        )
      : await client
          .from(picksTable)
          .delete()
          .eq("owner_id", user.id)
          .eq("week_start", week)
          .eq("look_id", id);
    return result.error
      ? makeupError(result.error)
      : json({ id, picked: raw.picked });
  } catch (error) {
    return makeupError(error);
  }
}

export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
