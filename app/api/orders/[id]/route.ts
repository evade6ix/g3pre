import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { shopifyAdminFetch } from "../../../../lib/shopify";

type FulfillmentOrder = {
  id: string;
  status: string;
  deliveryMethod: { methodType: string } | null;
  supportedActions: { action: string }[];
};

type OrderDetail = {
  id: string;
  name: string;
  createdAt: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  tags: string[];
  shippingAddress: Address | null;
  billingAddress: Address | null;
  fulfillmentOrders: { nodes: FulfillmentOrder[]; pageInfo: { hasNextPage: boolean } };
};

type Address = {
  name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
};

const orderQuery = `query OrderWorkspace($id: ID!) {
  order(id: $id) {
    id name createdAt email phone note tags
    shippingAddress { name company address1 address2 city province zip country phone }
    billingAddress { name company address1 address2 city province zip country phone }
    fulfillmentOrders(first: 100) {
      pageInfo { hasNextPage }
      nodes { id status deliveryMethod { methodType } supportedActions { action } }
    }
  }
}`;

async function loadOrder(id: string): Promise<OrderDetail | null> {
  const data = await shopifyAdminFetch<{ order: OrderDetail | null }>(orderQuery, { id });
  return data.order;
}

function orderId(raw: string): string | null {
  return /^\d+$/.test(raw) ? `gid://shopify/Order/${raw}` : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = orderId((await context.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid order ID" }, { status: 400 });
  try {
    const order = await loadOrder(id);
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load order" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = orderId((await context.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid order ID" }, { status: 400 });

  try {
    const body = await request.json();
    const order = await loadOrder(id);
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    if (order.fulfillmentOrders.pageInfo.hasNextPage) {
      return NextResponse.json({ ok: false, error: "This order has too many fulfillment groups. Open it in Shopify." }, { status: 409 });
    }
    const open = order.fulfillmentOrders.nodes.filter((fo) => fo.status === "OPEN");
    const blocked = order.fulfillmentOrders.nodes.some((fo) => !["OPEN", "CLOSED", "CANCELLED"].includes(fo.status));

    if (body.action === "ready_for_pickup") {
      const pickup = open.filter((fo) => fo.deliveryMethod?.methodType === "PICK_UP");
      if (blocked || !pickup.length || pickup.length !== open.length) {
        return NextResponse.json({ ok: false, error: "This order has no eligible pickup fulfillment, or it contains mixed fulfillment methods. Open it in Shopify." }, { status: 409 });
      }
      const result = await shopifyAdminFetch<{
        fulfillmentOrderLineItemsPreparedForPickup: { userErrors: { message: string }[] };
      }>(`mutation ReadyForPickup($input: FulfillmentOrderLineItemsPreparedForPickupInput!) {
        fulfillmentOrderLineItemsPreparedForPickup(input: $input) { userErrors { field message } }
      }`, { input: { lineItemsByFulfillmentOrder: pickup.map((fo) => ({ fulfillmentOrderId: fo.id })) } });
      const errors = result.fulfillmentOrderLineItemsPreparedForPickup.userErrors;
      if (errors.length) return NextResponse.json({ ok: false, error: errors.map((e) => e.message).join("; ") }, { status: 422 });
    } else if (body.action === "ship") {
      const trackingNumber = typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : "";
      const carrier = typeof body.carrier === "string" ? body.carrier.trim() : "";
      if (!trackingNumber || trackingNumber.length > 200 || carrier.length > 100) {
        return NextResponse.json({ ok: false, error: "Enter a valid tracking number" }, { status: 400 });
      }
      if (blocked || open.length !== 1 || open[0].deliveryMethod?.methodType !== "SHIPPING" ||
        !open[0].supportedActions.some(({ action }) => action === "CREATE_FULFILLMENT")) {
        return NextResponse.json({ ok: false, error: "This order needs a different fulfillment workflow. Open it in Shopify." }, { status: 409 });
      }
      const result = await shopifyAdminFetch<{
        fulfillmentCreate: { fulfillment: { id: string } | null; userErrors: { message: string }[] };
      }>(`mutation ShipOrder($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id status } userErrors { field message } }
      }`, { fulfillment: {
        notifyCustomer: true,
        trackingInfo: { number: trackingNumber, ...(carrier ? { company: carrier } : {}) },
        lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: open[0].id }],
      } });
      const payload = result.fulfillmentCreate;
      if (payload.userErrors.length || !payload.fulfillment) {
        return NextResponse.json({ ok: false, error: payload.userErrors.map((e) => e.message).join("; ") || "Shopify did not create the fulfillment" }, { status: 422 });
      }
    } else {
      return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }

    revalidateTag("g3pre-orders", { expire: 0 });
    return NextResponse.json({ ok: true, order: await loadOrder(id) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Shopify could not update this order" }, { status: 500 });
  }
}
