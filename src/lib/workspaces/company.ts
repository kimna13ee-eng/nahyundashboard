import "server-only";
import type { Task, TaskInput } from "../domain";
export interface CompanyRepository {
  listTasks(): Promise<Task[]>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: string, input: TaskInput): Promise<Task>;
  deleteTask(id: string): Promise<void>;
}
// 후속 승인 후 별도 FRENGLE Supabase 프로젝트 + 회사 전용 인증/권한 검증 구현.
// PERSONAL 클라이언트 및 개인 세션을 재사용하지 않습니다.
export function companyRepository(): never { throw new Error("FRENGLE 실제 데이터 연결은 승인 대기 상태입니다."); }
