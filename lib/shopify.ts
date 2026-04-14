import "server-only";
import { env } from "./env";

export async function shopifyAdminFetch<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(
    `https://${env.shopifyStoreDomain}/admin/api/2026-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": env.shopifyAdminAccessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    }
  );

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const json = JSON.parse(text);

  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }

  return json.data;
}