import type { Task, Workspace, Status } from "./domain";
// 예시 데이터만 포함. 회사 운영 데이터 및 인증정보는 사용하지 않습니다.
export function demoTasks(workspace: Workspace): Task[] {
  const titles = workspace === "PERSONAL" ? ["이번 주 개인 업무 정리", "MY OPS 대시보드 검토", "독서 노트 정리", "개인 포트폴리오 업데이트"] : ["샘플 캠페인 기획안 작성", "샘플 콘텐츠 초안 검토", "샘플 주간 리포트 정리"];
  return titles.map((title, i) => ({ id: `demo-${workspace}-${i}`, title, notes: "테스트용 예시 업무입니다.", status: (["running", "pending", "completed", "failed"] as Status[])[i], priority: i === 0 ? "high" : "normal", due_date: null, created_at: "2026-10-10T00:00:00Z" }));
}
export const demoRuns = [{name:"오늘의 업무 요약", status:"completed" as Status, time:"예시 · 09:00"},{name:"콘텐츠 초안 생성",status:"running" as Status,time:"예시 · 10:30"},{name:"주간 리포트 수집",status:"failed" as Status,time:"예시 · 11:15"}];
export const demoContent = [{title:"운영 루틴 소개",stage:"기획",type:"블로그"},{title:"한 주의 업무 기록",stage:"제작",type:"뉴스레터"},{title:"대시보드 활용법",stage:"검토",type:"숏폼"}];
