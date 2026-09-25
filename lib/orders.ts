import "server-only";
import { unstable_cache } from "next/cache";
import { shopifyAdminFetch } from "./shopify";

export const READY_FOR_PICKUP_TAG = "g3pre-ready-for-pickup";

export type OrderLineItemNode = {
  quantity: number;
  title?: string | null;
  variantTitle?: string | null;
  image?: { url: string } | null;
  variant?: { sku?: string | null; image?: { url: string } | null } | null;
  product?: { id: string } | null;
};

export type OrderNode = {
  id: string;
  legacyResourceId: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  tags: string[];
  shippingLine?: {
    title?: string | null;
    code?: string | null;
    deliveryCategory?: string | null;
  } | null;
  lineItems: { edges: { node: OrderLineItemNode }[] };
};

type OrdersPageResponse = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: { node: OrderNode }[];
  };
};

const ordersQuery = `
  query GetOrders($cursor: String) {
    orders(first: 100, after: $cursor, query: "fulfillment_status:unfulfilled", sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id legacyResourceId name createdAt cancelledAt tags
        shippingLine { title code deliveryCategory }
        lineItems(first: 100) { edges { node {
          quantity title variantTitle image { url(transform: { maxWidth: 160, maxHeight: 160 }) }
          variant { sku image { url(transform: { maxWidth: 160, maxHeight: 160 }) } }
          product { id }
        } } }
      } }
    }
  }
`;

async function scanUnfulfilledOrders(): Promise<OrderNode[]> {
  const orders: OrderNode[] = [];
  let cursor: string | null = null;

  while (true) {
    const data: OrdersPageResponse = await shopifyAdminFetch<OrdersPageResponse>(ordersQuery, { cursor });
    orders.push(...data.orders.edges.map(({ node }) => node).filter((order) =>
      !order.cancelledAt && !order.tags.includes(READY_FOR_PICKUP_TAG)
    ));
    if (!data.orders.pageInfo.hasNextPage) break;
    if (!data.orders.pageInfo.endCursor || data.orders.pageInfo.endCursor === cursor) {
      throw new Error("Shopify returned an incomplete orders page");
    }
    cursor = data.orders.pageInfo.endCursor;
  }

  return orders;
}

// Persist across serverless invocations. Both endpoints read the same snapshot,
// so clicking a product doesn't start another full Shopify pagination scan.
export const getUnfulfilledOrders = unstable_cache(
  scanUnfulfilledOrders,
  ["g3pre-unfulfilled-orders-v4"],
  { revalidate: 60, tags: ["g3pre-orders"] }
);
