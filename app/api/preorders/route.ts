import { NextResponse } from "next/server";
import { shopifyAdminFetch } from "../../../lib/shopify";
import { env } from "../../../lib/env";

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

type OrderNode = {
  id: string;
  name: string;
  lineItems: {
    edges: {
      node: {
        quantity: number;
        product?: {
          id: string;
        };
      };
    }[];
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

type OrdersPageResponse = {
  orders: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    edges: {
      node: OrderNode;
    }[];
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

async function fetchAllUnfulfilledOrders() {
  let hasNextPage = true;
  let cursor: string | null = null;
  let pageCount = 0;
  const allOrders: OrderNode[] = [];

  while (hasNextPage) {
    pageCount += 1;

    // safety stop so it never hangs forever
    if (pageCount > 20) {
      break;
    }

    const ordersQuery = `
      query GetOrders($cursor: String) {
        orders(
          first: 100
          after: $cursor
          query: "fulfillment_status:unfulfilled"
          sortKey: CREATED_AT
          reverse: true
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              name
              lineItems(first: 50) {
                edges {
                  node {
                    quantity
                    product {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const ordersData = (await shopifyAdminFetch(
      ordersQuery,
      { cursor }
    )) as OrdersPageResponse;

    for (const edge of ordersData.orders.edges) {
      allOrders.push(edge.node);
    }

    hasNextPage = ordersData.orders.pageInfo.hasNextPage;
    cursor = ordersData.orders.pageInfo.endCursor;

    // extra safety: stop if Shopify returns no cursor
    if (hasNextPage && !cursor) {
      break;
    }
  }

  return allOrders;
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

    const collectionData = (await shopifyAdminFetch(
  collectionQuery,
  {
    id: `gid://shopify/Collection/${env.preorderCollectionId}`,
  }
)) as CollectionResponse;
    const allOrders = await fetchAllUnfulfilledOrders();
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