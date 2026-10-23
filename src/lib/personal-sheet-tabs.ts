export type PersonalSheetTab = "planning" | "drafts" | "performance";

type PersonalSheetDefinition = Readonly<{
  gid: string;
  title: string;
  label: string;
  layout: "table" | "grid";
}>;

export const personalSheetTabs: Readonly<
  Record<PersonalSheetTab, PersonalSheetDefinition>
> = {
  planning: {
    gid: "1103",
    title: "03_기획",
    label: "기획",
    layout: "table",
  },
  drafts: {
    gid: "1104",
    title: "04_원고",
    label: "원고",
    layout: "table",
  },
  performance: {
    gid: "1106",
    title: "06_발행성과",
    label: "발행·성과",
    layout: "table",
  },
};

export function isPersonalSheetTab(value: unknown): value is PersonalSheetTab {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(personalSheetTabs, value)
  );
}
