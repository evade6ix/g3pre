import { NextResponse } from "next/server";
import { getOrderComments } from "../../../../../lib/order-comments";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const rawId = (await context.params).id;
  if (!/^\d+$/.test(rawId)) {
    return NextResponse.json({ ok: false, error: "Invalid order ID" }, { status: 400 });
  }
  try {
    const comments = await getOrderComments(`gid://shopify/Order/${rawId}`);
    if (!comments) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    return NextResponse.json({ ok: true, comments }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load staff comments. Check the order timeline in Shopify." }, { status: 500 });
  }
}
