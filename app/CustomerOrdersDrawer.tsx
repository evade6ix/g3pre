"use client";

export type CustomerOrder = {
  legacyResourceId: string;
  name: string;
  createdAt: string;
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  shippingAddress?: { address1: string | null; zip: string | null } | null;
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

export default function CustomerOrdersDrawer({ identity, orders, productIds, onClose }: {
  identity: CustomerIdentity;
  orders: CustomerOrder[];
  productIds: Set<string>;
  onClose: () => void;
}) {
  const matches = customerPreorders(identity, orders, productIds);
  return <div className="fixed inset-0 z-[70] flex justify-end bg-black/70" role="dialog" aria-modal="true" aria-label="Customer open preorders">
    <button className="flex-1" aria-label="Close customer orders" onClick={onClose} />
    <aside className="h-full w-full max-w-[680px] overflow-y-auto border-l border-white/10 bg-[#111a28] p-6 shadow-2xl md:p-8">
      <button onClick={onClose} className="mb-7 text-sm text-slate-400 hover:text-white">← Back to fulfillment</button>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Customer / Active preorders</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{identity.customerName || identity.customerEmail || "Customer"}</h2>
      <p className="mt-2 text-sm text-slate-400">{matches.length} open {matches.length === 1 ? "order" : "orders"} across all preorder products. Review shipping and pickup separately before packing.</p>
      <div className="mt-7 space-y-4">{matches.map((order) => <section key={order.legacyResourceId} className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold text-white">{order.name}</h3><p className="mt-1 text-xs text-slate-400">{new Date(order.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} · {order.fulfillmentMethod === "pickup" ? "Pickup" : "Shipping"}</p></div><span className="text-xs text-cyan-300">{order.items.reduce((n, item) => n + item.quantity, 0)} items</span></div>
        <div className="space-y-3">{order.items.map((item, index) => <div key={index} className="flex gap-3 text-sm"><img src={item.image || "/favicon.ico"} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block text-slate-200">{item.title}</span><span className="text-xs text-slate-500">{item.variantTitle || item.sku || ""}</span></span><span className="text-cyan-300">× {item.quantity}</span></div>)}</div>
      </section>)}</div>
    </aside>
  </div>;
}
