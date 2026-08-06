import { z } from "zod";

const url = z.string().url();
const httpsUrl = url.refine((value) => new URL(value).protocol === "https:", "HTTPS URL이 필요합니다.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const enabled = (value: string | undefined) => value === "true";

export type EnvironmentSource = Record<string, string | undefined>;

export function isE2EBypass(environment: EnvironmentSource = process.env) {
  return environment.NODE_ENV !== "production" && environment.E2E_BYPASS_AUTH === "true";
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
  if (enabled(environment.SARAMIN_CONNECTOR_ENABLED)) required.SARAMIN_API_KEY = z.string().min(1);
  if (enabled(environment.JOBKOREA_CONNECTOR_ENABLED)) required.JOBKOREA_API_URL = httpsUrl;

  const missing: string[] = [];
  for (const [name, schema] of Object.entries(required)) {
    if (!schema.safeParse(environment[name]).success) missing.push(name);
  }
  if (environment.NODE_ENV === "production" && environment.E2E_BYPASS_AUTH === "true") {
    missing.push("E2E_BYPASS_AUTH must be disabled");
  }
  if (missing.length) throw new Error(`Invalid server environment: ${missing.sort().join(", ")}`);

  return {
    appBaseUrl: environment.APP_BASE_URL,
    operatorName: environment.PUBLIC_OPERATOR_NAME,
    privacyEmail: environment.PUBLIC_PRIVACY_EMAIL,
    policyEffectiveDate: environment.PUBLIC_POLICY_EFFECTIVE_DATE,
  };
}
