import { validateServerEnvironment } from "@/lib/environment";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    validateServerEnvironment();
  }
}
