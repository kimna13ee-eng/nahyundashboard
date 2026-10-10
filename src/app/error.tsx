"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main style={{ padding: 40 }}>
      <h1>화면을 불러오지 못했습니다.</h1>
      <p style={{ margin: "20px 0" }}>
        연결 상태를 확인한 뒤 다시 시도해 주세요. 저장된 데이터는 자동 삭제하지
        않습니다.
      </p>
      <button className="ops-primary" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
