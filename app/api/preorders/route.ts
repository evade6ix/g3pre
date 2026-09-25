import { NextResponse } from "next/server";
import { shopifyAdminFetch } from "../../../lib/shopify";
import { env } from "../../../lib/env";
import { getUnfulfilledOrders } from "../../../lib/orders";

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
      edges: {
        node: ProductNode;
      }[];
    };
  };
};

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
    const collectionQuery = `
      query GetCollection($id: ID!) {
        collection(id: $id) {
          products(first: 100) {
            edges {
              node {
                id
                title
                handle
                featuredImage {
                  url
                }
                metafield(
                  namespace: "${env.releaseDateNamespace}"
                  key: "${env.releaseDateKey}"
                ) {
                  value
                }
              }
            }
          }
        }
      }
    `;

    const [collectionData, allOrders] = await Promise.all([
      shopifyAdminFetch<CollectionResponse>(collectionQuery, {
        id: `gid://shopify/Collection/${env.preorderCollectionId}`,
      }),
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

    const products = collectionData.collection.products.edges
      .map((edge) => {
        const p = edge.node;
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
      .filter((p) => p.releaseDate !== null)
      .filter((p) => p.releaseDate!.getTime() >= now.getTime())
      .sort((a, b) => a.releaseDate!.getTime() - b.releaseDate!.getTime());

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
