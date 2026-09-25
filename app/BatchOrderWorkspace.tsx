"use client";

import { useEffect, useRef, useState } from "react";

type ProductOrder = {
  orderId: string;
  orderName: string;
  date: string;
  quantity: number;
  fulfillmentMethod: string;
  items: { title?: string | null; variantTitle?: string | null; sku?: string | null; quantity?: number | null; image?: string | null }[];
};
type Address = { name: string | null; company: string | null; address1: string | null; address2: string | null; city: string | null; province: string | null; zip: string | null; country: string | null; phone: string | null };
type Detail = {
  email: string | null;
  phone: string | null;
  note: string | null;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  fulfillmentOrders: { nodes: { status: string; deliveryMethod: { methodType: string } | null; supportedActions: { action: string }[] }[]; pageInfo: { hasNextPage: boolean } };
};

export default function BatchOrderWorkspace({ productTitle, method, orders, onBack, onUpdated }: {
  productTitle: string;
  method: "pickup" | "shipping";
  orders: ProductOrder[];
  onBack: () => void;
  onUpdated: () => Promise<void>;
}) {
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1220] text-slate-100" role="dialog" aria-modal="true" aria-label={`${method} orders for ${productTitle}`}>
    <div className="mx-auto max-w-5xl px-5 pb-24 pt-7 md:px-9">
      <button onClick={onBack} className="mb-8 text-sm font-medium text-slate-400 hover:text-white">← Back to {productTitle} orders</button>
      <div className="mb-8 border-b border-white/10 pb-7"><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Product fulfillment queue</p><h2 className="mt-2 text-3xl font-semibold text-white md:text-4xl">{method === "pickup" ? "All pickups" : "All shipments"}</h2><p className="mt-3 text-sm text-slate-400">{productTitle} · {orders.length} {orders.length === 1 ? "order" : "orders"}. Work down the page; each action updates that order in Shopify.</p></div>
      {orders.length ? <div className="space-y-5">{orders.map((order, index) => <BatchCard key={order.orderId} order={order} method={method} index={index + 1} total={orders.length} onUpdated={onUpdated} />)}</div> : <div className="rounded-2xl border border-white/10 bg-[#151e2c] p-12 text-center text-sm text-slate-400">No {method === "pickup" ? "pickup" : "shipping"} orders for this product.</div>}
    </div>
  </div>;
}

function BatchCard({ order, method, index, total, onUpdated }: { order: ProductOrder; method: "pickup" | "shipping"; index: number; total: number; onUpdated: () => Promise<void> }) {
  const element = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  useEffect(() => {
    const node = element.current;
    if (!node || nearby) return;
    if (!("IntersectionObserver" in window)) { setNearby(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNearby(true); observer.disconnect(); }
    }, { rootMargin: "600px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [nearby]);

  useEffect(() => {
    if (!nearby) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/orders/${order.orderId}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load order");
      if (!cancelled) setDetail(data.order);
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load order"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nearby, order.orderId]);

  const fulfillmentOrders = detail?.fulfillmentOrders.nodes || [];
  const open = fulfillmentOrders.filter((fo) => fo.status === "OPEN");
  const blocked = !!detail && (detail.fulfillmentOrders.pageInfo.hasNextPage || fulfillmentOrders.some((fo) => !["OPEN", "CLOSED", "CANCELLED"].includes(fo.status)));
  const eligible = method === "pickup"
    ? !!detail && !blocked && open.length > 0 && open.every((fo) => fo.deliveryMethod?.methodType === "PICK_UP")
    : !!detail && !blocked && open.length === 1 && open[0].deliveryMethod?.methodType === "SHIPPING" && open[0].supportedActions.some(({ action }) => action === "CREATE_FULFILLMENT");

  async function complete() {
    if (submitting || !eligible) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${order.orderId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: method === "pickup" ? "ready_for_pickup" : "ship", carrier, trackingNumber }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Shopify could not update this order");
      setDetail(data.order);
      setSuccess(true);
      void onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shopify could not update this order");
    } finally {
      setSubmitting(false);
    }
  }

  const address = detail?.shippingAddress || detail?.billingAddress;
  return <section ref={element} className="rounded-2xl border border-white/10 bg-[#151e2c] p-5 shadow-[0_12px_40px_rgba(0,0,0,.15)] md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-5"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">Order {index} of {total}</p><h3 className="mt-1 text-2xl font-semibold text-white">{order.orderName}</h3><p className="mt-1 text-xs text-slate-400">{new Date(order.date).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} · {order.quantity} of this product</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${success ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-300/10 text-amber-200"}`}>{success ? "Updated in Shopify" : method === "pickup" ? "Pickup" : "Shipping"}</span></div>
    {loading ? <p className="py-7 text-sm text-slate-400">Loading customer and fulfillment details…</p> : <div className="grid gap-8 py-6 md:grid-cols-2"><div><p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Customer</p><p className="font-medium text-white">{address?.name || "Customer name unavailable"}</p><p className="mt-2 text-sm text-slate-300">{detail?.email || "No email"}</p><p className="mt-1 text-sm text-slate-300">{detail?.phone || address?.phone || "No phone"}</p>{method === "shipping" && address && <p className="mt-4 text-sm leading-6 text-slate-400">{address.address1}{address.address2 ? `, ${address.address2}` : ""}<br />{[address.city, address.province, address.zip].filter(Boolean).join(", ")}<br />{address.country}</p>}{detail?.note && <p className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-slate-300">Note: {detail.note}</p>}</div><div><p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Items in order</p><div className="space-y-3">{order.items.map((item, itemIndex) => <div key={itemIndex} className="flex gap-3 text-sm"><img src={item.image || "/favicon.ico"} alt="" className="h-11 w-11 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block text-slate-200">{item.title}</span><span className="text-xs text-slate-500">{item.variantTitle || item.sku || ""}</span></span><span className="text-cyan-300">× {item.quantity}</span></div>)}</div></div></div>}
    {error && <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</div>}
    {success ? <p className="border-t border-white/10 pt-5 text-sm font-medium text-emerald-200">✓ {method === "pickup" ? "Ready for pickup" : "Shipment created"} in Shopify. Customer notification requested.</p> : detail && <div className="border-t border-white/10 pt-5">{eligible ? method === "pickup" ? <button disabled={submitting} onClick={() => void complete()} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-[#0b1220] hover:bg-cyan-200 disabled:opacity-50">{submitting ? "Updating Shopify…" : "Mark ready for pickup"}</button> : <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-medium text-slate-400">Carrier (optional)<input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="FedEx, Canada Post…" className="mt-2 block w-44 rounded-xl border border-white/10 bg-[#0b1220] px-3 py-3 text-sm text-white outline-none focus:border-cyan-300" /></label><label className="min-w-48 flex-1 text-xs font-medium text-slate-400">Tracking number<input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="Enter tracking number" className="mt-2 block w-full rounded-xl border border-white/10 bg-[#0b1220] px-3 py-3 text-sm text-white outline-none focus:border-cyan-300" /></label><button disabled={submitting || !trackingNumber.trim()} onClick={() => void complete()} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-[#0b1220] hover:bg-cyan-200 disabled:opacity-50">{submitting ? "Updating Shopify…" : "Mark shipped"}</button></div> : <p className="text-sm text-slate-400">This order is already processed or has a fulfillment setup that needs Shopify Admin.</p>}</div>}
  </section>;
}
