import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTask, storageKey, type TaskInput } from "../src/lib/domain.ts";
import { demoTasks } from "../src/lib/demo.ts";
const valid:TaskInput = {title:"  업무  ",notes:"메모",status:"pending",priority:"normal",due_date:null};
test("업무 입력 정리 및 모든 상태 수용",()=>{
  assert.equal(parseTask(valid).title,"업무");
  for(const status of ["pending","running","completed","failed"] as const) assert.equal(parseTask({...valid,status}).status,status);
});
test("잘못된 제목, 상태, 우선순위, 날짜 거부",()=>{
  for(const patch of [{title:" "},{title:"a".repeat(121)},{status:"unknown"},{priority:"urgent"},{due_date:"2026-02-30"},{due_date:"2026-13-01"},{notes:"a".repeat(2001)}]) assert.throws(()=>parseTask({...valid,...patch}));
  assert.equal(parseTask({...valid,due_date:"2028-02-29"}).due_date,"2028-02-29");
});
test("워크스페이스 테스트 저장소 및 예시 업무 분리",()=>{
  assert.notEqual(storageKey("PERSONAL"),storageKey("FRENGLE"));
  const personal = demoTasks("PERSONAL"), company = demoTasks("FRENGLE");
  assert.ok(personal.every(p=>company.every(c=>c.id !== p.id)));
  personal[0].title = "변경";
  assert.notEqual(demoTasks("PERSONAL")[0].title,"변경");
});
