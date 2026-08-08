import { createAdminClient } from "@/lib/supabase/admin";

export type RestrictedProviderRecord = {
  code: string;
  enabled: boolean;
  activation_required: boolean;
  access_mode: string | null;
  approval_status: string;
  approval_reference: string | null;
  approval_expires_at: string | null;
  staging_smoke_reference: string | null;
  enabled_at: string | null;
  enabled_by: string | null;
  attribution: unknown;
  retention_policy: unknown;
};

export type SourceActivationReason =
  | "SOURCE_PROVIDER_MISSING"
  | "SOURCE_APPROVAL_PENDING"
  | "SOURCE_APPROVAL_BLOCKED"
  | "SOURCE_APPROVAL_WITHDRAWN"
  | "SOURCE_APPROVAL_STALE"
  | "SOURCE_ACTIVATION_INCOMPLETE"
  | "SOURCE_CREDENTIAL_MISSING"
  | "CONNECTOR_DISABLED";

export type SourceActivation =
  | { enabled: true; provider: "saramin" }
  | { enabled: false; provider: "saramin"; reason: SourceActivationReason };

type ProviderReader = {
  readProvider(code: "saramin"): Promise<RestrictedProviderRecord | null>;
};

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAttribution(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const attribution = value as Record<string, unknown>;
  if (!nonBlank(attribution.text) || !nonBlank(attribution.href)) return false;
  try {
    const href = new URL(attribution.href);
    return href.protocol === "https:" && !href.username && !href.password;
  } catch {
    return false;
  }
}

function hasRetention(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);
}

function defaultReader(): ProviderReader {
  const client = createAdminClient();
  return {
    async readProvider(code) {
      const { data, error } = await client
        .from("source_providers")
        .select("code,enabled,activation_required,access_mode,approval_status,approval_reference,approval_expires_at,staging_smoke_reference,enabled_at,enabled_by,attribution,retention_policy")
        .eq("code", code)
        .maybeSingle();
      if (error) throw new Error("SOURCE_ACTIVATION_LOOKUP_FAILED");
      return data as RestrictedProviderRecord | null;
    },
  };
}

/**
 * The only live-provider approval boundary. This module is server-only by
 * ownership: it imports the service-role admin client and is only called from
 * Route Handler/collector server paths. It returns a secret-free typed result
 * and reads the restricted row on every invocation.
 */
export async function resolveSaraminActivation(
  dependencies?: ProviderReader,
  environment: Record<string, string | undefined> = process.env,
  now = new Date(),
): Promise<SourceActivation> {
  let record: RestrictedProviderRecord | null;
  try {
    record = await (dependencies ?? defaultReader()).readProvider("saramin");
  } catch {
    return { enabled: false, provider: "saramin", reason: "CONNECTOR_DISABLED" };
  }

  if (!record) return { enabled: false, provider: "saramin", reason: "SOURCE_PROVIDER_MISSING" };
  if (record.approval_status === "blocked") return { enabled: false, provider: "saramin", reason: "SOURCE_APPROVAL_BLOCKED" };
  if (record.approval_status === "withdrawn") return { enabled: false, provider: "saramin", reason: "SOURCE_APPROVAL_WITHDRAWN" };
  if (record.approval_status !== "approved") return { enabled: false, provider: "saramin", reason: "SOURCE_APPROVAL_PENDING" };
  const expiry = record.approval_expires_at ? Date.parse(record.approval_expires_at) : Number.NaN;
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) {
    return { enabled: false, provider: "saramin", reason: "SOURCE_APPROVAL_STALE" };
  }
  if (
    !record.enabled
    || !record.activation_required
    || record.access_mode !== "approved_api"
    || !nonBlank(record.approval_reference)
    || !nonBlank(record.staging_smoke_reference)
    || !record.enabled_at
    || !record.enabled_by
    || !hasAttribution(record.attribution)
    || !hasRetention(record.retention_policy)
  ) {
    return { enabled: false, provider: "saramin", reason: "SOURCE_ACTIVATION_INCOMPLETE" };
  }
  if (!nonBlank(environment.SARAMIN_API_KEY)) {
    return { enabled: false, provider: "saramin", reason: "SOURCE_CREDENTIAL_MISSING" };
  }
  return { enabled: true, provider: "saramin" };
}
