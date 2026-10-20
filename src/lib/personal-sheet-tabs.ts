export const personalSheetGroups = [
  { id: "production", label: "콘텐츠 운영" },
  { id: "research", label: "리서치·아이디어" },
  { id: "brand", label: "캐릭터·가이드" },
  { id: "operations", label: "운영 관리" },
] as const;

export const personalSheetTabs = {
  planning: {
    gid: "1103",
    title: "03_기획",
    label: "기획",
    group: "production",
    layout: "table",
  },
  drafts: {
    gid: "1104",
    title: "04_원고",
    label: "원고",
    group: "production",
    layout: "table",
  },
  review: {
    gid: "1105",
    title: "05_검수",
    label: "검수",
    group: "production",
    layout: "table",
  },
  performance: {
    gid: "1106",
    title: "06_발행성과",
    label: "발행·성과",
    group: "production",
    layout: "table",
  },
  references: {
    gid: "1101",
    title: "01_레퍼런스",
    label: "레퍼런스",
    group: "research",
    layout: "table",
  },
  research: {
    gid: "1102",
    title: "02_리서치",
    label: "리서치",
    group: "research",
    layout: "table",
  },
  grokInbox: {
    gid: "1110",
    title: "10_Grok_인박스",
    label: "Grok 인박스",
    group: "research",
    layout: "table",
  },
  characterBible: {
    gid: "1111",
    title: "11_캐릭터_바이블",
    label: "캐릭터 바이블",
    group: "brand",
    layout: "table",
  },
  visualDna: {
    gid: "1113",
    title: "13_셀카_비주얼DNA",
    label: "셀카·비주얼 DNA",
    group: "brand",
    layout: "table",
  },
  characterInterpretation: {
    gid: "1114",
    title: "14_통합_캐해",
    label: "통합 캐해",
    group: "brand",
    layout: "table",
  },
  referenceInterpretation: {
    gid: "1115",
    title: "15_레퍼런스_해석",
    label: "레퍼런스 해석",
    group: "brand",
    layout: "table",
  },
  calibration: {
    gid: "1116",
    title: "16_콘텐츠_캘리브레이션",
    label: "콘텐츠 캘리브레이션",
    group: "brand",
    layout: "table",
  },
  dashboard: {
    gid: "1828527468",
    title: "00_대시보드",
    label: "시트 대시보드",
    group: "operations",
    layout: "grid",
  },
  handoffs: {
    gid: "1107",
    title: "07_인계로그",
    label: "인계 로그",
    group: "operations",
    layout: "table",
  },
  rules: {
    gid: "1108",
    title: "08_직원규칙",
    label: "직원 규칙",
    group: "operations",
    layout: "table",
  },
  agentGuide: {
    gid: "1112",
    title: "12_에이전트_실행지침",
    label: "에이전트 실행지침",
    group: "operations",
    layout: "table",
  },
  settings: {
    gid: "1109",
    title: "09_설정",
    label: "운영 설정",
    group: "operations",
    layout: "table",
  },
} as const;

export type PersonalSheetTab = keyof typeof personalSheetTabs;

export function isPersonalSheetTab(value: unknown): value is PersonalSheetTab {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(personalSheetTabs, value)
  );
}
