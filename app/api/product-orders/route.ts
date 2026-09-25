import { NextResponse } from "next/server";
import { getUnfulfilledOrders, type OrderNode } from "../../../lib/orders";

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

    const allOrders = await getUnfulfilledOrders();
    const shopDomain = process.env.SHOPIFY_STORE_DOMAIN;

    const results: Array<{
      orderId: string;
      orderName: string;
      date: string;
      quantity: number;
      adminUrl: string | null;
      fulfillmentMethod: "shipping" | "pickup";
      shippingMethodLabel: string | null;
      customerName: string | null;
      customerEmail: string | null;
      customerId: string | null;
      shippingAddress: OrderNode["shippingAddress"];
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
          orderId: order.legacyResourceId,
          orderName: order.name,
          date: order.createdAt,
          quantity: matchedQuantity,
          adminUrl:
            shopDomain && order.legacyResourceId
              ? `https://${shopDomain}/admin/orders/${order.legacyResourceId}`
              : null,
          fulfillmentMethod: delivery.fulfillmentMethod,
          shippingMethodLabel: delivery.shippingMethodLabel,
          customerName: order.shippingAddress?.name || order.billingAddress?.name || null,
          customerEmail: order.email,
          customerId: order.customer?.id || null,
          shippingAddress: order.shippingAddress,
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
