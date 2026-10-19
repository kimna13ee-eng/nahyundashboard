import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { personalClient, personalConfigured } from "@/lib/supabase/server";
import {
  isPersonalSheetTab,
  fetchPersonalSheetCsv,
  parseGoogleSheetCsv,
  personalSheetRowLimit,
  personalSheetTabs,
  type PersonalSheetData,
} from "@/lib/personal-sheets";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (
    params.getAll("workspace").length !== 1 ||
    params.get("workspace") !== "PERSONAL"
  )
    return json({ error: "콘텐츠 시트는 PERSONAL에서만 볼 수 있습니다." }, 403);
  const tab = params.get("tab");
  if (
    !isPersonalSheetTab(tab) ||
    params.getAll("tab").length !== 1 ||
    [...params.keys()].some((key) => key !== "workspace" && key !== "tab")
  )
    return json({ error: "기획·원고·성과 시트 중 하나를 선택해 주세요." }, 400);
  if (!personalConfigured())
    return json({ error: "PERSONAL 연결이 필요합니다." }, 503);

  try {
    const client = await personalClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return json({ error: "개인 계정 로그인이 필요합니다." }, 401);
    // This source belongs to the authenticated user. A shared server URL or
    // caller-supplied owner ID must never select another person's workbook.
    const source = await client
      .from("ops_personal_sheet_sources")
      .select("spreadsheet_id")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (source.error)
      return json(
        {
          error:
            "콘텐츠 시트 연결 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          setupRequired: true,
        },
        503,
      );
    if (!source.data)
      return json(
        {
          error: "개인 계정에 연결된 콘텐츠 시트가 없습니다.",
          setupRequired: true,
        },
        503,
      );
    const { sourceUrl, body } = await fetchPersonalSheetCsv(
      source.data.spreadsheet_id,
      tab,
    );
    const sheet = parseGoogleSheetCsv(body, tab);
    const result: PersonalSheetData = {
      tab,
      sheetTitle: personalSheetTabs[tab].title,
      ...sheet,
      fetchedAt: new Date().toISOString(),
      sourceUrl,
      rowLimit: personalSheetRowLimit,
    };
    return json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name)
    )
      return json(
        { error: "시트 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요." },
        504,
      );
    // Do not expose fetch URLs, Google payloads, database errors, or auth data.
    return json(
      {
        error:
          "콘텐츠 시트를 불러오지 못했습니다. 연결과 원본 시트 접근 권한을 확인해 주세요.",
      },
      502,
    );
  }
}
