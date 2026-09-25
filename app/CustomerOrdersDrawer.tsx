"use client";

import { useState } from "react";

export type CustomerOrder = {
  legacyResourceId: string;
  name: string;
  createdAt: string;
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  shippingAddress?: { address1: string | null; address2?: string | null; city?: string | null; province?: string | null; zip: string | null; country?: string | null } | null;
  fulfillmentMethod: "pickup" | "shipping";
  items: { productId?: string | null; title: string; variantTitle?: string | null; sku?: string | null; quantity: number; image?: string | null }[];
};

export type CustomerIdentity = Pick<CustomerOrder, "customerId" | "customerName" | "customerEmail" | "shippingAddress">;

function normalized(value?: string | null) { return value?.trim().toLowerCase() || ""; }

export function sameCustomer(a: CustomerIdentity, b: CustomerIdentity) {
  if (a.customerId && b.customerId) return a.customerId === b.customerId;
  if (a.customerEmail && b.customerEmail) return normalized(a.customerEmail) === normalized(b.customerEmail);
  return !!(a.customerName && b.customerName && a.shippingAddress?.address1 && b.shippingAddress?.address1 && a.shippingAddress?.zip && b.shippingAddress?.zip &&
    normalized(a.customerName) === normalized(b.customerName) && normalized(a.shippingAddress.address1) === normalized(b.shippingAddress.address1) && normalized(a.shippingAddress.zip) === normalized(b.shippingAddress.zip));
}

export function customerPreorders(identity: CustomerIdentity, orders: CustomerOrder[], productIds: Set<string>) {
  return orders.filter((order) => sameCustomer(identity, order) && order.items.some((item) => item.productId && productIds.has(item.productId)));
}

export default function CustomerOrdersDrawer({ identity, orders, productIds, onClose, onProcessed, onUpdated }: {
  identity: CustomerIdentity;
  orders: CustomerOrder[];
  productIds: Set<string>;
  onClose: () => void;
  onProcessed: (orderId: string) => void;
  onUpdated: () => Promise<void>;
}) {
  const matches = customerPreorders(identity, orders, productIds);
  const [selected, setSelected] = useState<string[]>([]);
  const [combined, setCombined] = useState<CustomerOrder[] | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const shipping = combined?.filter((order) => order.fulfillmentMethod === "shipping" && !completed.includes(order.legacyResourceId)) || [];
  const pickup = combined?.filter((order) => order.fulfillmentMethod === "pickup" && !completed.includes(order.legacyResourceId)) || [];
  const destinations = new Set(shipping.map((order) => [order.shippingAddress?.address1, order.shippingAddress?.address2, order.shippingAddress?.city, order.shippingAddress?.province, order.shippingAddress?.zip, order.shippingAddress?.country].map(normalized).join("|")));
  const sameDestination = destinations.size <= 1 && shipping.every((order) => !!order.shippingAddress?.address1 && !!order.shippingAddress?.zip);

  async function fulfill(method: "shipping" | "pickup") {
    const pending = method === "shipping" ? shipping : pickup;
    if (busy || !pending.length || (method === "shipping" && (!trackingNumber.trim() || !sameDestination))) return;
    setBusy(true);
    setError("");
    for (const order of pending) {
      try {
        const response = await fetch(`/api/orders/${order.legacyResourceId}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: method === "shipping" ? "ship" : "ready_for_pickup", trackingNumber, carrier }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Shopify could not update this order");
        setCompleted((previous) => [...previous, order.legacyResourceId]);
        onProcessed(order.legacyResourceId);
        if (data.warning) setWarnings((previous) => [...previous, `${order.name}: ${data.warning}`]);
      } catch (cause) {
        setError(`${order.name} failed: ${cause instanceof Error ? cause.message : "Shopify could not update this order"}. Earlier successful orders remain updated; review the list before retrying.`);
        break;
      }
    }
    setBusy(false);
    void onUpdated();
  }

  return <div className="fixed inset-0 z-[70] flex justify-end bg-black/70" role="dialog" aria-modal="true" aria-label="Customer open preorders">
    <button className="flex-1" aria-label="Close customer orders" onClick={() => { if (!busy) onClose(); }} />
    <aside className="h-full w-full max-w-[760px] overflow-y-auto border-l border-white/10 bg-[#111a28] p-6 shadow-2xl md:p-8">
      <button disabled={busy} onClick={combined ? () => { setCombined(null); setSelected([]); setError(""); } : onClose} className="mb-7 text-sm text-slate-400 hover:text-white disabled:opacity-50">{combined ? "← Back to customer orders" : "← Back to fulfillment"}</button>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Customer / Active preorders</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{identity.customerName || identity.customerEmail || "Customer"}</h2>
      <p className="mt-2 text-sm text-slate-400">{combined ? `${combined.length} selected orders · ${completed.length} updated in Shopify` : `${matches.length} open ${matches.length === 1 ? "order" : "orders"} across all preorder products. Select the orders to work on together.`}</p>
      {!combined && <div className="mt-5 flex flex-wrap items-center gap-3"><button onClick={() => setSelected(matches.map((order) => order.legacyResourceId))} className="text-sm text-cyan-300 hover:underline">Select all</button><button onClick={() => setSelected([])} className="text-sm text-slate-400 hover:underline">Clear</button><button disabled={!selected.length} onClick={() => { setCombined(matches.filter((order) => selected.includes(order.legacyResourceId))); setCompleted([]); setWarnings([]); setError(""); }} className="ml-auto rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-[#0b1220] disabled:opacity-50">Create combined view ({selected.length}) →</button></div>}
      <div className="mt-7 space-y-4">{(combined || matches).map((order) => <section key={order.legacyResourceId} className={`rounded-2xl border p-5 ${combined && completed.includes(order.legacyResourceId) ? "border-emerald-400/30 bg-emerald-400/[.06]" : selected.includes(order.legacyResourceId) ? "border-cyan-300/40 bg-cyan-300/[.05]" : "border-white/10 bg-white/[.04]"}`}>
        <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-3">{!combined && <input type="checkbox" aria-label={`Select ${order.name}`} checked={selected.includes(order.legacyResourceId)} onChange={() => setSelected((previous) => previous.includes(order.legacyResourceId) ? previous.filter((id) => id !== order.legacyResourceId) : [...previous, order.legacyResourceId])} className="h-5 w-5 accent-cyan-300" />}<div><h3 className="font-semibold text-white">{order.name} {completed.includes(order.legacyResourceId) && <span className="text-sm text-emerald-300">✓ Updated</span>}</h3><p className="mt-1 text-xs text-slate-400">{new Date(order.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} · {order.fulfillmentMethod === "pickup" ? "Pickup" : "Shipping"}</p></div></div><span className="text-xs text-cyan-300">{order.items.reduce((n, item) => n + item.quantity, 0)} items</span></div>
        {order.fulfillmentMethod === "shipping" && <p className="mb-4 text-xs text-slate-400">Ship to: {[order.shippingAddress?.address1, order.shippingAddress?.address2, order.shippingAddress?.city, order.shippingAddress?.province, order.shippingAddress?.zip, order.shippingAddress?.country].filter(Boolean).join(", ") || "Address unavailable"}</p>}
        <div className="space-y-3">{order.items.map((item, index) => <div key={index} className="flex gap-3 text-sm"><img src={item.image || "/favicon.ico"} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block text-slate-200">{item.title}</span><span className="text-xs text-slate-500">{item.variantTitle || item.sku || ""}</span></span><span className="text-cyan-300">× {item.quantity}</span></div>)}</div>
      </section>)}</div>
      {combined && <div className="mt-7 space-y-5 border-t border-white/10 pt-6">
        {shipping.length > 0 && <section className="rounded-2xl border border-sky-300/20 bg-sky-300/[.05] p-5"><h3 className="font-semibold text-white">Shipping · {shipping.length} pending</h3><p className="mt-2 text-sm text-slate-400">Use one package and tracking number for these separate Shopify orders.</p>{!sameDestination && <p className="mt-3 rounded-lg bg-amber-300/10 p-3 text-sm text-amber-200">These shipping orders have different or missing destinations. Select orders for one verified address together before applying shared tracking.</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Carrier (optional)<input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="FedEx, Canada Post…" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-3 py-3 text-sm text-white" /></label><label className="text-xs text-slate-400">Tracking number<input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="One package tracking number" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-3 py-3 text-sm text-white" /></label></div><button disabled={busy || !sameDestination || !trackingNumber.trim()} onClick={() => void fulfill("shipping")} className="mt-4 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-[#0b1220] disabled:opacity-50">{busy ? "Updating Shopify…" : `Mark ${shipping.length} shipped & notify`}</button></section>}
        {pickup.length > 0 && <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[.05] p-5"><h3 className="font-semibold text-white">Pickup · {pickup.length} pending</h3><p className="mt-2 text-sm text-slate-400">Mark each selected pickup order ready in Shopify and request its customer notification.</p><button disabled={busy} onClick={() => void fulfill("pickup")} className="mt-4 rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-[#0b1220] disabled:opacity-50">{busy ? "Updating Shopify…" : `Mark ${pickup.length} ready for pickup`}</button></section>}
        {!shipping.length && !pickup.length && <p className="rounded-xl bg-emerald-400/10 p-4 text-sm text-emerald-200">All selected orders were updated in Shopify.</p>}
        {error && <p className="rounded-xl bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p>}{warnings.map((warning, index) => <p key={index} className="rounded-xl bg-amber-400/10 p-4 text-sm text-amber-200">{warning}</p>)}
      </div>}
    </aside>
  </div>;
}
