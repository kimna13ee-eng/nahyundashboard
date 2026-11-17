import type { NextRequest } from "next/server";
import { json } from "@/lib/http";
import {
  allowedQuery,
  lookId,
  makeupError,
  makeupSession,
  MakeupInputError,
  photoTable,
  photoType,
} from "@/lib/makeup-looks-server";

export async function makeupImage(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
  table: typeof photoTable | "ops_makeup_tips",
) {
  try {
    const params = req.nextUrl.searchParams;
    allowedQuery(params, table === photoTable ? ["size"] : ["size", "v"]);
    if (params.has("size") && params.get("size") !== "thumb")
      throw new MakeupInputError("사진 크기 요청을 확인해 주세요.");
    const id = lookId((await context.params).id);
    const { client, user } = await makeupSession();
    const read = (column: "image" | "thumbnail") =>
      client
        .from(table)
        .select(column)
        .eq("owner_id", user.id)
        .eq("id", id)
        .maybeSingle();
    const thumb = params.get("size") === "thumb";
    let result = await read(thumb ? "thumbnail" : "image");
    if (
      thumb &&
      !result.error &&
      result.data &&
      !("thumbnail" in result.data && result.data.thumbnail)
    )
      result = await read("image");
    if (result.error) return makeupError(result.error);
    const encoded =
      result.data &&
      ("image" in result.data ? result.data.image : result.data.thumbnail);
    if (typeof encoded !== "string" || !encoded.startsWith("\\x"))
      return json({ error: "사진을 찾을 수 없어요." }, 404);
    const bytes = Buffer.from(encoded.slice(2), "hex");
    const type = photoType(bytes);
    if (!type) return json({ error: "사진 파일을 표시할 수 없어요." }, 415);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return makeupError(error);
  }
}
