const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const SEOUL_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;

function validDayMilliseconds(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith("0000-")) return null;
  const value = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(value.getTime()) &&
    value.toISOString().slice(0, 10) === day
    ? value.getTime()
    : null;
}

/** New personal content is all-day; exercise starts at 21:00 in Seoul. */
export function personalScheduleFields(day: string, exercise = false) {
  const selectedDay = validDayMilliseconds(day);
  if (selectedDay === null)
    throw new Error("일정을 등록할 날짜를 확인해 주세요.");
  const midnight = selectedDay - SEOUL_OFFSET_MILLISECONDS;
  const start = midnight + (exercise ? 21 * 60 * 60 * 1000 : 0);
  const end = exercise ? start + 60 * 60 * 1000 : midnight + DAY_MILLISECONDS;
  return {
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(end).toISOString(),
    project_id: null,
    notes: "",
  };
}

function localDateTimeValue(value: string) {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const parts = [year, month, day, hour, minute].map(Number);
  const date = new Date(
    Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]),
  );
  if (
    date.getUTCFullYear() !== parts[0] ||
    date.getUTCMonth() !== parts[1] - 1 ||
    date.getUTCDate() !== parts[2] ||
    date.getUTCHours() !== parts[3] ||
    date.getUTCMinutes() !== parts[4]
  )
    return null;
  return date.getTime();
}

export function addSeoulMinutes(value: string, minutes: number) {
  const timestamp = localDateTimeValue(value);
  if (timestamp === null || !Number.isInteger(minutes)) return "";
  return new Date(timestamp + minutes * 60000).toISOString().slice(0, 16);
}

export function scheduleDefaults(day: string) {
  const startsAt = `${day}T09:00`;
  return { startsAt, endsAt: addSeoulMinutes(startsAt, 60) };
}

export function scheduleRangeError(startsAt: string, endsAt: string) {
  if (!startsAt || !endsAt) return "";
  const start = localDateTimeValue(startsAt),
    end = localDateTimeValue(endsAt);
  if (start === null || end === null)
    return "시작시간과 종료시간을 확인해 주세요.";
  return end <= start ? "종료시간은 시작시간보다 늦어야 합니다." : "";
}
