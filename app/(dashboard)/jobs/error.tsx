"use client";

export default function JobsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section className="card stack" role="alert">
      <h1>공고를 불러오지 못했습니다</h1>
      <p>일시적인 문제입니다. 잠시 후 다시 시도해 주세요.</p>
      <p className="muted">요청 ID: {error.digest ?? "unknown"}</p>
      <button className="button" type="button" onClick={retry}>다시 시도</button>
    </section>
  );
}