import type { Container } from "@cloudflare/containers";
export interface Environment {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  ASSETS: Fetcher;
  CORE: DurableObjectNamespace<Container<Environment>>;
  CORE_DATABASE: string;
  CORE_PASSWORD: string;
  ADMIN_TOKEN: string;
  APP_REVISION: string;
  SENTRY_DSN?: string;
  DEMO_MODE?: string;
}
