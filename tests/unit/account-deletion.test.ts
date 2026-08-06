import { afterEach, describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  isExactAccountDeletionConfirmation,
} from "@/lib/legal/policy";
import { createAdminClient } from "@/lib/supabase/admin";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalPublicServiceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("NEXT_PUBLIC_SUPABASE_URL", originalUrl);
  restore("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", originalPublishableKey);
  restore("SUPABASE_SERVICE_ROLE_KEY", originalServiceRoleKey);
  restore("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", originalPublicServiceRoleKey);
});

describe("account deletion confirmation", () => {
  it("accepts only the exact irreversible-action phrase", () => {
    expect(ACCOUNT_DELETION_CONFIRMATION).toBe("회원탈퇴");
    expect(isExactAccountDeletionConfirmation("회원탈퇴")).toBe(true);
  });

  it.each([
    " 회원탈퇴",
    "회원탈퇴 ",
    "회원 탈퇴",
    "회원탈퇴\n",
    "회원탈퇴합니다",
    "",
    null,
    undefined,
  ])("does not trim, normalize, or partially match %j", (value) => {
    expect(isExactAccountDeletionConfirmation(value)).toBe(false);
  });
});

describe("Supabase Admin client environment boundary", () => {
  it("refuses to initialize without the server-only service-role key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-key";
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY = "must-not-be-used";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => createAdminClient()).toThrow("Supabase admin environment is not configured.");
  });

  it("constructs the Admin Auth surface only when server credentials are present", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-service-role-key";

    const admin = createAdminClient();

    expect(admin.auth.admin.deleteUser).toBeTypeOf("function");
  });
});
