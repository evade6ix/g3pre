import { NextResponse } from "next/server";
import { getUnfulfilledOrders } from "../../../lib/orders";

export async function GET() {
  try {
    const orders = await getUnfulfilledOrders();
    return NextResponse.json({
      ok: true,
      orders: orders.map((order) => ({
        id: order.id,
        legacyResourceId: order.legacyResourceId,
        adminUrl: `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/orders/${order.legacyResourceId}`,
        name: order.name,
        customerId: order.customer?.id || null,
        customerName: order.shippingAddress?.name || order.billingAddress?.name || null,
        customerEmail: order.email,
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt,
        shippingMethod: order.shippingLine?.title || order.shippingLine?.code || "Shipping",
        fulfillmentMethod: /pick[_ -]?up|in[ -]?store|storefront/i.test(
          [order.shippingLine?.title, order.shippingLine?.code, order.shippingLine?.deliveryCategory].join(" ")
        ) ? "pickup" : "shipping",
        items: order.lineItems.edges.map(({ node }) => ({
          productId: node.product?.id || null,
          title: node.title || "Untitled item",
          variantTitle: node.variantTitle || null,
          sku: node.variant?.sku || null,
          quantity: node.quantity,
          image: node.image?.url || node.variant?.image?.url || null,
        })),
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load orders" }, { status: 500 });
  }
}
