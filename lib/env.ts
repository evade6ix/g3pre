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

  // NEW
  releaseDateNamespace: requireEnv("SHOPIFY_RELEASE_DATE_NAMESPACE"),
  releaseDateKey: requireEnv("SHOPIFY_RELEASE_DATE_KEY"),
  preorderCollectionId: requireEnv("SHOPIFY_PREORDER_COLLECTION_ID"),
};