export type LeaveProfile = {
  hire_date: string;
  prior_used: number;
  prior_used_date: string | null;
};
export type LeaveEntry = {
  id?: string;
  date: string;
  kind: "grant" | "use" | "adjust";
  amount: number | string;
  title?: string;
};
export type LeaveLot = {
  id: string;
  date: string;
  expiresOn: string | null;
  amount: number;
  remaining: number;
  kind: "monthly" | "annual" | "manual";
};
export type LeaveGrant = {
  date: string;
  amount: number;
  kind: "monthly" | "annual";
};

export function leaveDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > "9999-12-31"
  )
    throw new Error("연차 날짜를 확인해 주세요.");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error("연차 날짜를 확인해 주세요.");
  return value;
}

export function seoulToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

export function parseLeaveProfile(raw: unknown): LeaveProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("연차 설정 입력값을 확인해 주세요.");
  const value = raw as Record<string, unknown>;
  const hire_date = leaveDate(value.hire_date);
  if (hire_date > "9998-12-31") throw new Error("입사일을 확인해 주세요.");
  const prior_used = value.prior_used;
  if (
    typeof prior_used !== "number" ||
    !Number.isFinite(prior_used) ||
    prior_used < 0 ||
    prior_used > 365 ||
    !Number.isInteger(prior_used * 2)
  )
    throw new Error(
      "기존 사용 연차는 0~365일 사이의 0.5일 단위로 입력해 주세요.",
    );
  const prior_used_date =
    value.prior_used_date == null || value.prior_used_date === ""
      ? null
      : leaveDate(value.prior_used_date);
  if (prior_used_date && (prior_used === 0 || prior_used_date < hire_date))
    throw new Error("기존 연차 사용일과 사용량을 확인해 주세요.");
  return { hire_date, prior_used, prior_used_date };
}

export function parseLeaveUsage(raw: unknown, hireDate?: string) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("연차 사용 입력값을 확인해 주세요.");
  const value = raw as Record<string, unknown>;
  const amount = value.amount;
  if (typeof amount !== "number" || (amount !== 0.5 && amount !== 1))
    throw new Error("사용 연차는 0.5일 또는 1일로 입력해 주세요.");
  const title =
    value.title == null || value.title === ""
      ? amount === 0.5
        ? "반차"
        : "연차"
      : value.title;
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120)
    throw new Error("연차 메모는 120자 이내로 입력해 주세요.");
  const date = leaveDate(value.date);
  if (hireDate !== undefined && date < leaveDate(hireDate))
    throw new Error("연차 사용 날짜는 입사일 이후로 입력해 주세요.");
  return {
    date,
    amount: -amount,
    kind: "use" as const,
    title: title.trim(),
  };
}

// Every anniversary is calculated from the original hire date; month-end
// clamping never shifts the following month's anniversary.
function anniversary(hireDate: string, months: number): string | null {
  const source = new Date(`${hireDate}T00:00:00Z`);
  const target = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1),
  );
  if (target.getUTCFullYear() > 9999) return null;
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(source.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Personal estimate assuming monthly perfect attendance during the first year
 * and at least 80% attendance afterwards. Positive manual grants are additional
 * credits, not copies of automatic accrual. Existing signed entries are applied
 * exactly once. No rows are written just to advance the calendar.
 */
export function calculateLeave(
  profileRaw: LeaveProfile,
  entries: readonly LeaveEntry[],
  asOfRaw: string,
) {
  const profile = parseLeaveProfile(profileRaw);
  const asOf = leaveDate(asOfRaw);
  const firstAnniversary = anniversary(profile.hire_date, 12)!;
  const automatic: Array<LeaveGrant & { expiresOn: string | null }> = [];
  for (let month = 1; month <= 11; month++) {
    automatic.push({
      date: anniversary(profile.hire_date, month)!,
      amount: 1,
      kind: "monthly",
      expiresOn: firstAnniversary,
    });
  }
  const completedYears = Math.max(
    0,
    Number(asOf.slice(0, 4)) - Number(profile.hire_date.slice(0, 4)),
  );
  for (let year = 1; year <= completedYears + 1; year++) {
    const date = anniversary(profile.hire_date, year * 12);
    if (!date) break;
    automatic.push({
      date,
      amount: Math.min(25, 15 + Math.floor((year - 1) / 2)),
      kind: "annual",
      expiresOn: anniversary(profile.hire_date, (year + 1) * 12),
    });
    if (date > asOf) break;
  }
  const next = automatic.find((grant) => grant.date > asOf);
  const nextGrant: LeaveGrant | null = next
    ? { date: next.date, amount: next.amount, kind: next.kind }
    : null;
  type Event = {
    date: string;
    amount: number;
    id: string;
    lotKind?: LeaveLot["kind"];
    expiresOn?: string | null;
    usage?: boolean;
    adjustment?: boolean;
  };
  const events: Event[] = automatic
    .filter((grant) => grant.date <= asOf)
    .map((grant) => ({
      ...grant,
      id: `${grant.kind}:${grant.date}`,
      lotKind: grant.kind,
    }));
  let granted = events.reduce((sum, event) => sum + event.amount, 0);
  let used = 0;
  let adjustment = 0;
  for (const [index, entry] of entries.entries()) {
    const date = leaveDate(entry.date);
    const amount =
      typeof entry.amount === "number" ? entry.amount : Number(entry.amount);
    if (
      !Number.isFinite(amount) ||
      amount === 0 ||
      Math.abs(amount) > 365 ||
      !Number.isInteger(amount * 2) ||
      !["grant", "use", "adjust"].includes(entry.kind) ||
      (entry.kind === "grant" && amount < 0) ||
      (entry.kind === "use" && amount > 0)
    )
      throw new Error("연차 기록을 확인해 주세요.");
    if (date > asOf) continue;
    if (entry.kind === "grant") granted += amount;
    if (entry.kind === "use") used -= amount;
    if (entry.kind === "adjust") adjustment += amount;
    events.push({
      date,
      amount,
      id: `entry:${entry.id ?? index}`,
      lotKind: "manual",
      expiresOn: null,
      usage: entry.kind === "use",
      adjustment: entry.kind === "adjust",
    });
  }
  // An unknown historical date uses the hire date for allocation only. It stays
  // visibly undated in the profile rather than inventing a usage record.
  const priorDate = profile.prior_used_date ?? profile.hire_date;
  if (profile.prior_used > 0 && priorDate <= asOf) {
    used += profile.prior_used;
    events.push({
      date: priorDate,
      amount: -profile.prior_used,
      id: "prior-used",
      usage: true,
    });
  }
  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.amount < 0) - Number(b.amount < 0) ||
      a.id.localeCompare(b.id),
  );
  const lots: LeaveLot[] = [];
  let debt = 0;
  let expired = 0;
  const expire = (date: string) => {
    for (const lot of lots) {
      if (lot.expiresOn && lot.expiresOn <= date && lot.remaining > 0) {
        expired += lot.remaining;
        lot.remaining = 0;
      }
    }
  };
  for (const event of events) {
    expire(event.date);
    if (event.amount > 0) {
      const paidDebt = Math.min(debt, event.amount);
      debt -= paidDebt;
      lots.push({
        id: event.id,
        date: event.date,
        expiresOn: event.expiresOn ?? null,
        amount: event.amount,
        remaining: event.amount - paidDebt,
        kind: event.lotKind ?? "manual",
      });
    } else {
      let remaining = -event.amount;
      // Spend the credit that expires soonest, keeping old unexpired annual
      // credit ahead of manual credits without an expiration date.
      const spendable = lots
        .filter((lot) => lot.remaining > 0)
        .sort(
          (a, b) =>
            (a.expiresOn ?? "9999-12-31").localeCompare(
              b.expiresOn ?? "9999-12-31",
            ) ||
            a.date.localeCompare(b.date) ||
            a.id.localeCompare(b.id),
        );
      for (const lot of spendable) {
        const spent = Math.min(remaining, lot.remaining);
        lot.remaining -= spent;
        remaining -= spent;
        if (remaining === 0) break;
      }
      debt += remaining;
    }
  }
  expire(asOf);
  return {
    asOf,
    granted,
    used,
    balance: lots.reduce((sum, lot) => sum + lot.remaining, 0) - debt,
    expired,
    adjustment,
    firstAnniversary,
    nextGrant,
    lots,
    unknownPriorUsedDate:
      profile.prior_used > 0 && profile.prior_used_date === null,
  };
}
