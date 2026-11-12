"use client";

import { BlogKeywords } from "./blog-keywords";
import "./personal-content-planner.css";

const weeklyReels = [
  {
    day: "월",
    title: "알고리즘 & 편집 휴식",
    note: "업로드 없이 쉬어가는 날",
    time: null,
    tone: "rest",
  },
  {
    day: "화",
    title: "출근 메이크업",
    note: "",
    time: "17:30",
    tone: "weekday",
  },
  {
    day: "수",
    title: "포인트형 남돌 커버",
    note: "주근깨 · 썬번",
    time: "17:30",
    tone: "weekday",
  },
  {
    day: "목",
    title: "출근 메이크업",
    note: "",
    time: "17:30",
    tone: "weekday",
  },
  {
    day: "금",
    title: "컨셉 메이크업",
    note: "고전미녀 · 일본미소녀",
    time: "17:30",
    tone: "weekday",
  },
  {
    day: "토",
    title: "다크 힙 남돌 커버",
    note: "뱀파이어 · 피어싱 등",
    time: "21:30",
    tone: "weekend",
  },
  {
    day: "일",
    title: "따라할만한 여돌 메이크업",
    note: "",
    time: "21:30",
    tone: "weekend",
  },
] as const;

function WeeklyReelsSchedule() {
  return (
    <section className="content-weekly" aria-labelledby="weekly-reels-title">
      <header className="content-weekly-heading">
        <div>
          <p className="content-weekly-account">@ny.iro</p>
          <h2 id="weekly-reels-title">주간 릴스 편성표</h2>
        </div>
        <span className="content-weekly-fixed">매주 고정</span>
      </header>
      <p className="content-weekly-caption">주 6회 업로드 · 한국시간 기준</p>
      <ol className="content-weekly-days">
        {weeklyReels.map((entry) => (
          <li key={entry.day} className={`content-weekly-day is-${entry.tone}`}>
            <span className="content-weekly-day-label">
              {entry.day}
              <span className="sr-only">요일</span>
            </span>
            <div className="content-weekly-topic">
              <strong>{entry.title}</strong>
              {entry.note && <span>{entry.note}</span>}
            </div>
            {entry.time ? (
              <time className="content-weekly-time" dateTime={entry.time}>
                {entry.time}
              </time>
            ) : (
              <span className="content-weekly-off">업로드 X</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PersonalContentPlanner({
  enabled,
  onSessionExpired,
}: {
  enabled: boolean;
  onSessionExpired?: () => void;
}) {
  return (
    <section className="content-planner" aria-label="콘텐츠 플래너">
      <WeeklyReelsSchedule />
      <BlogKeywords enabled={enabled} onSessionExpired={onSessionExpired} />
    </section>
  );
}
