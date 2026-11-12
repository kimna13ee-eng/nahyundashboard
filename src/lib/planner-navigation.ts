import { validYogaDay } from "./yoga-week.ts";

export type PlannerView = "content" | "yoga";
export type PlannerLocation = {
  view: PlannerView;
  day?: string;
  schedule?: string;
};

/** Keep existing iPhone notification links working after retiring Calendar. */
export function plannerLocation(params: URLSearchParams): PlannerLocation {
  const view = params.get("view");
  const yoga = ["yoga", "yoga-planner", "calendar"].includes(view || "");
  const date = params.get("date") || "";
  const schedule = params.get("schedule") || "";
  return {
    view: yoga ? "yoga" : "content",
    ...(yoga && validYogaDay(date) ? { day: date } : {}),
    ...(yoga &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      schedule,
    )
      ? { schedule }
      : {}),
  };
}
