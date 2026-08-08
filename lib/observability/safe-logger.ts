export type SafeEvent = {
  requestId?: string;
  category: string;
  outcome: "success" | "failure" | "denied";
  errorCode?: string;
  durationMs?: number;
};

export function requestId(value?: string | null) {
  return value && /^[A-Za-z0-9_-]{8,80}$/.test(value) ? value : crypto.randomUUID();
}

const sensitiveAssignment = /(["']?\b(?:access[-_]?key|access[-_]?token|api[-_]?key|authorization|client[-_]?secret|credentials?|oauth[-_]?token|password|private[-_]?key|refresh[-_]?token|secret|token)\b["']?\s*[:=]\s*)(?:Bearer\s+)?(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s,;}\]&]+)/gi;

function safeLabel(value: string) {
  return value
    .replace(/https?:\/\/[^\s]+/gi, "[REDACTED_URL]")
    .replace(sensitiveAssignment, "$1[REDACTED]")
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .slice(0, 80);
}

export function toSafeEvent(event: SafeEvent) {
  return {
    timestamp: new Date().toISOString(),
    requestId: event.requestId,
    category: safeLabel(event.category),
    outcome: event.outcome,
    errorCode: event.errorCode === undefined ? undefined : safeLabel(event.errorCode),
    durationBucket: event.durationMs === undefined ? undefined : event.durationMs < 250 ? "lt250" : event.durationMs < 1000 ? "lt1000" : "gte1000",
  };
}

export function logSafeEvent(event: SafeEvent) {
  console.info(JSON.stringify(toSafeEvent(event)));
}
