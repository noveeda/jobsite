import { z } from "zod";

const url = z.string().url();
const httpsUrl = url.refine((value) => new URL(value).protocol === "https:", "HTTPS URL이 필요합니다.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const featureFlag = z.enum(["true", "false"]);
const cronSecret = z.string().min(16);
const uuid = z.string().uuid();
const operatorIds = z.string().refine((value) => {
  const ids = value.split(",").map((id) => id.trim());
  return ids.length > 0 && ids.every((id) => uuid.safeParse(id).success) && new Set(ids).size === ids.length;
}, "쉼표로 구분한 고유한 UUID 목록이 필요합니다.");
const enabled = (value: string | undefined) => value === "true";
const configured = (value: string | undefined) => Boolean(value?.trim());

export type EnvironmentSource = Record<string, string | undefined>;

export function isE2EBypass(environment: EnvironmentSource = process.env) {
  return environment.NODE_ENV !== "production" && environment.E2E_BYPASS_AUTH === "true";
}

export function isE2ERateLimitTestSupport(environment: EnvironmentSource = process.env) {
  return isE2EBypass(environment) && environment.E2E_RATE_LIMIT_TEST_SUPPORT === "true";
}

export function validateServerEnvironment(environment: EnvironmentSource = process.env) {
  const required: Record<string, z.ZodType<string>> = {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  };
  if (environment.NODE_ENV === "production") {
    Object.assign(required, {
      APP_BASE_URL: httpsUrl,
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
      PUBLIC_OPERATOR_NAME: z.string().min(1),
      PUBLIC_PRIVACY_EMAIL: z.string().email(),
      PUBLIC_POLICY_EFFECTIVE_DATE: isoDate,
    });
  }
  for (const name of ["AUTOMATIC_DISCOVERY_ENABLED", "COLLECTOR_ENABLED"] as const) {
    if (configured(environment[name])) required[name] = featureFlag;
  }
  if (enabled(environment.COLLECTOR_ENABLED) || configured(environment.CRON_SECRET)) required.CRON_SECRET = cronSecret;
  if (configured(environment.OPERATOR_USER_IDS)) required.OPERATOR_USER_IDS = operatorIds;
  if (enabled(environment.SARAMIN_CONNECTOR_ENABLED)) required.SARAMIN_API_KEY = z.string().min(1);
  if (enabled(environment.JOBKOREA_CONNECTOR_ENABLED)) required.JOBKOREA_API_URL = httpsUrl;

  const missing: string[] = [];
  for (const [name, schema] of Object.entries(required)) {
    if (!schema.safeParse(environment[name]).success) missing.push(name);
  }
  if (environment.NODE_ENV === "production" && environment.E2E_BYPASS_AUTH === "true") {
    missing.push("E2E_BYPASS_AUTH must be disabled");
  }
  if (environment.NODE_ENV === "production" && environment.E2E_RATE_LIMIT_TEST_SUPPORT === "true") {
    missing.push("E2E_RATE_LIMIT_TEST_SUPPORT must be disabled");
  }
  if (missing.length) throw new Error(`Invalid server environment: ${missing.sort().join(", ")}`);

  return {
    appBaseUrl: environment.APP_BASE_URL,
    automaticDiscoveryEnabled: enabled(environment.AUTOMATIC_DISCOVERY_ENABLED),
    collectorEnabled: enabled(environment.COLLECTOR_ENABLED),
    operatorUserIds: configured(environment.OPERATOR_USER_IDS)
      ? environment.OPERATOR_USER_IDS!.split(",").map((id) => id.trim())
      : [],
    operatorName: environment.PUBLIC_OPERATOR_NAME,
    privacyEmail: environment.PUBLIC_PRIVACY_EMAIL,
    policyEffectiveDate: environment.PUBLIC_POLICY_EFFECTIVE_DATE,
  };
}
