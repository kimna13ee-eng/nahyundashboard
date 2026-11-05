/** Retired integrations must not authenticate, load results, or accept writes. */
export function automationRetired() {
  return Response.json(
    {
      error: "대시보드의 GPT 자동화 연결이 종료되었습니다.",
      code: "AUTOMATION_RETIRED",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
