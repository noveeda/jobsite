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

export function toSafeEvent(event: SafeEvent) {
  return {
    timestamp: new Date().toISOString(),
    requestId: event.requestId,
    category: event.category.slice(0, 80),
    outcome: event.outcome,
    errorCode: event.errorCode?.slice(0, 80),
    durationBucket: event.durationMs === undefined ? undefined : event.durationMs < 250 ? "lt250" : event.durationMs < 1000 ? "lt1000" : "gte1000",
  };
}

export function logSafeEvent(event: SafeEvent) {
  console.info(JSON.stringify(toSafeEvent(event)));
}
