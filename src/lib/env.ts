/**
 * Centralised environment access.
 *
 * Anything read here is read on the server unless the name begins with
 * NEXT_PUBLIC_. Secrets are never re-exported to client components.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export function serverEnv() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
    adminEmail:
      optional("ADMIN_NOTIFICATION_EMAIL") ?? "admin@destinymarketinggroup.com",
    emailProvider: optional("EMAIL_PROVIDER"),
    resendApiKey: optional("RESEND_API_KEY"),
    emailFrom: optional("EMAIL_FROM"),
    jobSecret: optional("JOB_SECRET"),
    siteUrl: publicEnv.siteUrl,
  };
}

/** Jersey Home Pros is a separate system; nothing is assumed about it. */
export function jhpConfig() {
  const baseUrl = optional("JHP_API_BASE_URL");
  const apiKey = optional("JHP_API_KEY");
  const enabled = optional("JHP_INTEGRATION_ENABLED") === "true";

  return {
    baseUrl,
    apiKey,
    /**
     * Transmission is only possible when the integration has been explicitly
     * enabled AND real credentials exist. Until then requests are retained in
     * the queue instead of being sent to an assumed endpoint.
     */
    configured: Boolean(enabled && baseUrl && apiKey),
    enabled,
  };
}
