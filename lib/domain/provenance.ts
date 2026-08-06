export type ValueOrigin = "source" | "normalized" | "user" | "missing" | "not_applicable" | "failed";
export type ProvenanceEntry = { origin: ValueOrigin; sourceId?: string | null; observedAt?: string | null };
export type FieldProvenance = Record<string, ProvenanceEntry>;

export function markUserFields(current: FieldProvenance, fields: readonly string[]): FieldProvenance {
  const next = { ...current };
  for (const field of fields) next[field] = { origin: "user", sourceId: null, observedAt: null };
  return next;
}
export function buildSummary(values: { companyName?: string; title?: string; roleName?: string; locations?: string[] }) {
  return [values.companyName, values.title, values.roleName, values.locations?.join(" · ")].filter(Boolean).join(" — ").slice(0, 1000);
}

export function applySourceValues<T extends Record<string, unknown>>(current: T, incoming: Partial<T>, provenance: FieldProvenance): T {
  const next = { ...current };
  for (const [field, value] of Object.entries(incoming)) if (provenance[field]?.origin !== "user") next[field as keyof T] = value as T[keyof T];
  return next;
}
