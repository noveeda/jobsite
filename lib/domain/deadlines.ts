export type DeadlineState = { key: "due_soon" | "open" | "expired" | "rolling" | "until_hired" | "unknown"; label: string };
export function deadlineState(kind: "fixed" | "rolling" | "until_hired" | "unknown", deadline: string | null, now = new Date()): DeadlineState {
  if (kind === "rolling") return { key: "rolling", label: "상시채용" };
  if (kind === "until_hired") return { key: "until_hired", label: "채용 시 마감" };
  if (kind !== "fixed" || !deadline) return { key: "unknown", label: "마감일 미정" };
  const days = Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { key: "expired", label: "마감" };
  if (days <= 3) return { key: "due_soon", label: days === 0 ? "오늘 마감" : `D-${days}` };
  return { key: "open", label: `D-${days}` };
}
