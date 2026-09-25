import { NextResponse } from "next/server";
import { shopifyAdminFetch } from "../../../lib/shopify";
import { env } from "../../../lib/env";
import { getUnfulfilledOrders } from "../../../lib/orders";
import { unstable_cache } from "next/cache";

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  featuredImage?: {
    url: string;
  };
  metafield?: {
    value: string;
  };
};

type CollectionResponse = {
  collection: {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: {
        node: ProductNode;
      }[];
    };
  } | null;
};

const collectionQuery = `
  query GetCollection($id: ID!, $cursor: String) {
    collection(id: $id) {
      products(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id title handle featuredImage { url(transform: { maxWidth: 400, maxHeight: 400 }) }
          metafield(namespace: "${env.releaseDateNamespace}", key: "${env.releaseDateKey}") { value }
        } }
      }
    }
  }
`;

const getCollectionProducts = unstable_cache(async (): Promise<ProductNode[]> => {
  const products: ProductNode[] = [];
  let cursor: string | null = null;
  const collectionId = `gid://shopify/Collection/${env.preorderCollectionId}`;

  do {
    const data: CollectionResponse = await shopifyAdminFetch<CollectionResponse>(collectionQuery, {
      id: collectionId,
      cursor,
    });
    if (!data.collection) throw new Error("Preorder collection not found");

    const page = data.collection.products;
    products.push(...page.edges.map(({ node }) => node));
    if (!page.pageInfo.hasNextPage) break;
    if (!page.pageInfo.endCursor || page.pageInfo.endCursor === cursor) {
      throw new Error("Shopify returned an incomplete collection page");
    }
    cursor = page.pageInfo.endCursor;
  } while (true);

  return products;
}, ["g3pre-preorder-collection-v2"], { revalidate: 60 });

function parseReleaseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;

  const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/g, "$1");
  const parsed = new Date(cleaned);

  if (isNaN(parsed.getTime())) {
    const parts = cleaned.split(" ");
    if (parts.length === 2) {
      return new Date(`${parts[0]} 1, ${parts[1]}`);
    }
    return null;
  }

  return parsed;
}

export async function GET() {
  try {
    const [collectionProducts, allOrders] = await Promise.all([
      getCollectionProducts(),
      getUnfulfilledOrders(),
    ]);
    const now = new Date();

    const orderMap: Record<string, number> = {};

    for (const order of allOrders) {
      for (const itemEdge of order.lineItems.edges) {
        const item = itemEdge.node;
        const productId = item.product?.id;

        if (!productId) continue;

        orderMap[productId] = (orderMap[productId] || 0) + item.quantity;
      }
    }

    const products = collectionProducts
      .map((p) => {
        const parsedDate = parseReleaseDate(p.metafield?.value || null);

        return {
          id: p.id,
          title: p.title,
          handle: p.handle,
          image: p.featuredImage?.url || null,
          rawDate: p.metafield?.value || null,
          releaseDate: parsedDate,
          orderCount: orderMap[p.id] || 0,
        };
      })
      .filter((p) => !p.releaseDate || p.releaseDate.getTime() >= now.getTime() || p.orderCount > 0)
      .sort((a, b) => (a.releaseDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.releaseDate?.getTime() ?? Number.MAX_SAFE_INTEGER));

    return NextResponse.json({
      ok: true,
      count: products.length,
      scannedUnfulfilledOrders: allOrders.length,
      products,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
