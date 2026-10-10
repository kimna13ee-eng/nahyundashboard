import { NextRequest } from "next/server";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import { parseTask } from "@/lib/domain";
import { json, sameOrigin } from "@/lib/http";
const columns = "id,title,notes,status,priority,due_date,created_at";
async function handle(req: NextRequest) {
  // 클라이언트 선택 값은 권한이 아닙니다. 회사 요청은 개인 DB 생성 전에 거부합니다.
  if (req.nextUrl.searchParams.get("workspace") !== "PERSONAL") return json({error:"FRENGLE 실제 DB 연결은 승인 후 구현합니다."},403);
  if (req.method !== "GET" && !sameOrigin(req)) return json({error:"허용되지 않은 요청입니다."},403);
  if (!personalConfigured()) return json({error:"PERSONAL DB가 연결되지 않았습니다."},503);
  try {
    const client = await personalClient();
    const {data:{user},error:authError} = await client.auth.getUser();
    if (authError || !user) return json({error:"개인 계정 로그인이 필요합니다."},401);
    if (req.method === "GET") {
      const {data,error} = await client.from("tasks").select(columns).eq("owner_id",user.id).order("created_at",{ascending:false});
      return error ? json({error:"업무 조회에 실패했습니다. DB 설정을 확인해 주세요."},503) : json({tasks:data});
    }
    const body = await req.json();
    if (req.method === "POST") {
      const task = parseTask(body);
      const {data,error} = await client.from("tasks").insert({...task,owner_id:user.id}).select(columns).single();
      return error ? json({error:"업무 저장에 실패했습니다."},503) : json({task:data},201);
    }
    if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) return json({error:"업무 ID를 확인해 주세요."},400);
    if (req.method === "PATCH") {
      const {data,error} = await client.from("tasks").update(parseTask(body)).eq("id",body.id).eq("owner_id",user.id).select(columns).maybeSingle();
      return error ? json({error:"업무 수정에 실패했습니다."},503) : data ? json({task:data}) : json({error:"업무를 찾을 수 없습니다."},404);
    }
    const {data,error} = await client.from("tasks").delete().eq("id",body.id).eq("owner_id",user.id).select("id").maybeSingle();
    return error ? json({error:"업무 삭제에 실패했습니다."},503) : data ? json({ok:true}) : json({error:"업무를 찾을 수 없습니다."},404);
  } catch (error) { return json({error: error instanceof Error && /입력|제목|메모|상태|순위|날짜|마감|업무 정보/.test(error.message) ? error.message : "요청을 처리하지 못했습니다."},400); }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
