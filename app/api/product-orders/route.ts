import { NextResponse } from "next/server";
import { shopifyAdminFetch } from "../../../lib/shopify";

type OrderLineItemNode = {
  quantity: number;
  title?: string | null;
  variantTitle?: string | null;
  image?: {
    url: string;
  } | null;
  variant?: {
    sku?: string | null;
    image?: {
      url: string;
    } | null;
  } | null;
  product?: {
    id: string;
  } | null;
};

type OrderNode = {
  id: string;
  legacyResourceId: string;
  name: string;
  createdAt: string;
  shippingLine?: {
    title?: string | null;
    code?: string | null;
    deliveryCategory?: string | null;
  } | null;
  lineItems: {
    edges: {
      node: OrderLineItemNode;
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

function getDeliveryInfo(order: OrderNode): {
  fulfillmentMethod: "shipping" | "pickup";
  shippingMethodLabel: string | null;
} {
  const title = order.shippingLine?.title?.trim() || "";
  const code = order.shippingLine?.code?.trim() || "";
  const category = order.shippingLine?.deliveryCategory?.trim() || "";

  const normalizedTitle = title.toLowerCase();
  const normalizedCode = code.toLowerCase();
  const normalizedCategory = category.toLowerCase();

  const isPickup =
    normalizedCategory === "pickup" ||
    normalizedCategory.includes("pickup") ||
    normalizedTitle.includes("pickup") ||
    normalizedTitle.includes("pick up") ||
    normalizedTitle.includes("in store") ||
    normalizedTitle.includes("in-store") ||
    normalizedTitle.includes("storefront") ||
    normalizedCode.includes("pickup") ||
    normalizedCode.includes("local_pickup") ||
    normalizedCode.includes("local pickup");

  return {
    fulfillmentMethod: isPickup ? "pickup" : "shipping",
    shippingMethodLabel: isPickup ? "In-Store Pickup" : title || code || category || "Shipping",
  };
}
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
              shippingLine {
                title
                code
                deliveryCategory
              }
              lineItems(first: 100) {
                edges {
                  node {
                    quantity
                    title
                    variantTitle
                    image {
                      url
                    }
                    variant {
                      sku
                      image {
                        url
                      }
                    }
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
      fulfillmentMethod: "shipping" | "pickup";
      shippingMethodLabel: string | null;
      items: Array<{
        title: string | null;
        variantTitle: string | null;
        sku: string | null;
        quantity: number;
        image: string | null;
      }>;
    }> = [];

    for (const order of allOrders) {
      let matchedQuantity = 0;

      for (const itemEdge of order.lineItems.edges) {
        const item = itemEdge.node;
        if (item.product?.id === productId) {
          matchedQuantity += item.quantity;
        }
      }

      if (matchedQuantity > 0) {
        const delivery = getDeliveryInfo(order);

        results.push({
          orderName: order.name,
          date: order.createdAt,
          quantity: matchedQuantity,
          adminUrl:
            shopDomain && order.legacyResourceId
              ? `https://${shopDomain}/admin/orders/${order.legacyResourceId}`
              : null,
          fulfillmentMethod: delivery.fulfillmentMethod,
          shippingMethodLabel: delivery.shippingMethodLabel,
          items: order.lineItems.edges.map(({ node }) => ({
            title: node.title || null,
            variantTitle: node.variantTitle || null,
            sku: node.variant?.sku || null,
            quantity: node.quantity,
            image: node.image?.url || node.variant?.image?.url || null,
          })),
        });
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