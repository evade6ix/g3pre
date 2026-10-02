function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env variable: ${name}`);
  }
  return value;
}

export const env = {
  shopifyStoreDomain: requireEnv("SHOPIFY_STORE_DOMAIN"),
  shopifyAdminAccessToken: requireEnv("SHOPIFY_ADMIN_ACCESS_TOKEN"),

  releaseDateNamespace: requireEnv("SHOPIFY_RELEASE_DATE_NAMESPACE"),
  releaseDateKey: requireEnv("SHOPIFY_RELEASE_DATE_KEY"),
  // Keep the selected collection in source so an old deployment env value cannot override it.
  preorderCollectionId: "489992749195",
};