import { NextResponse } from "next/server";
import { shopifyAdminFetch } from "../../../lib/shopify";

type OrderNode = {
  id: string;
  legacyResourceId: string;
  name: string;
  createdAt: string;
  lineItems: {
    edges: {
      node: {
        quantity: number;
        product?: {
          id: string;
        } | null;
      };
    }[];
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

async function fetchAllUnfulfilledOrders(): Promise<OrderNode[]> {
  let hasNextPage = true;
  let cursor: string | null = null;
  let pageCount = 0;
  const allOrders: OrderNode[] = [];

  while (hasNextPage) {
    pageCount += 1;

    if (pageCount > 20) {
      break;
    }

    const query = `
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
              legacyResourceId
              name
              createdAt
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

    const data = (await shopifyAdminFetch(query, {
      cursor,
    })) as OrdersPageResponse;

    for (const edge of data.orders.edges) {
      allOrders.push(edge.node);
    }

    hasNextPage = data.orders.pageInfo.hasNextPage;
    cursor = data.orders.pageInfo.endCursor;

    if (hasNextPage && !cursor) {
      break;
    }
  }

  return allOrders;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { ok: false, error: "Missing productId" },
        { status: 400 }
      );
    }

    const allOrders = await fetchAllUnfulfilledOrders();
    const shopDomain = process.env.SHOPIFY_STORE_DOMAIN;

    const results: Array<{
      orderName: string;
      date: string;
      quantity: number;
      adminUrl: string | null;
    }> = [];

    for (const order of allOrders) {
      for (const itemEdge of order.lineItems.edges) {
        const item = itemEdge.node;

        if (item.product?.id === productId) {
          results.push({
            orderName: order.name,
            date: order.createdAt,
            quantity: item.quantity,
            adminUrl:
              shopDomain && order.legacyResourceId
                ? `https://${shopDomain}/admin/orders/${order.legacyResourceId}`
                : null,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      orders: results,
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