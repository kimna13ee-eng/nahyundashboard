import Link from "next/link";

export default function Consent() {
  return (
    <main
      className="editorial"
      style={{ maxWidth: 640, margin: "40px auto", padding: 24 }}
    >
      <h1>GPT 자동화 연결 종료</h1>
      <p>대시보드에서 GPT 자동화 결과를 받는 기능을 종료했어요.</p>
      <p>새 연결 승인이나 자동화 결과 저장은 제공하지 않습니다.</p>
      <Link href="/frengle">대시보드로 돌아가기</Link>
    </main>
  );
}
