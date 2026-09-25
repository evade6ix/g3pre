"use client";

import { useEffect, useMemo, useState } from "react";

type Product = { id: string; title: string; handle: string; image: string | null; rawDate: string | null; orderCount: number };
type Item = { productId?: string | null; title: string; variantTitle?: string | null; sku?: string | null; quantity: number; image?: string | null };
type Order = { id: string; legacyResourceId: string; adminUrl: string; name: string; createdAt: string; shippingMethod: string; fulfillmentMethod: "pickup" | "shipping"; items: Item[] };
type Address = { name: string | null; company: string | null; address1: string | null; address2: string | null; city: string | null; province: string | null; zip: string | null; country: string | null; phone: string | null };
type FulfillmentOrder = { id: string; status: string; deliveryMethod: { methodType: string } | null; supportedActions: { action: string }[] };
type Detail = { id: string; name: string; createdAt: string; email: string | null; phone: string | null; note: string | null; tags: string[]; shippingAddress: Address | null; billingAddress: Address | null; fulfillmentOrders: { nodes: FulfillmentOrder[]; pageInfo: { hasNextPage: boolean } } };
type ProductOrder = { orderId: string; orderName: string; date: string; quantity: number; fulfillmentMethod: string; shippingMethodLabel: string | null; items: Item[] };

const surface = "rounded-2xl border border-white/10 bg-[#151e2c] shadow-[0_12px_40px_rgba(0,0,0,.15)]";

export default function HomePage() {
  const [tab, setTab] = useState<"orders" | "products">("orders");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pickup" | "shipping">("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productOrders, setProductOrders] = useState<ProductOrder[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [productResponse, orderResponse] = await Promise.all([fetch("/api/preorders"), fetch("/api/orders")]);
      const [productData, orderData] = await Promise.all([productResponse.json(), orderResponse.json()]);
      if (!productResponse.ok || !productData.ok) throw new Error(productData.error || "Could not load products");
      if (!orderResponse.ok || !orderData.ok) throw new Error(orderData.error || "Could not load orders");
      setProducts(productData.products || []);
      setOrders(orderData.orders || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const preorderIds = useMemo(() => new Set(products.map((p) => p.id)), [products]);
  const preorderOrders = useMemo(() => orders.filter((order) => order.items.some((item) => item.productId && preorderIds.has(item.productId))), [orders, preorderIds]);
  const visibleOrders = useMemo(() => preorderOrders.filter((order) => {
    const q = search.trim().toLowerCase();
    return (filter === "all" || filter === order.fulfillmentMethod) &&
      (!q || order.name.toLowerCase().includes(q) || order.items.some((item) => `${item.title} ${item.sku || ""}`.toLowerCase().includes(q)));
  }), [preorderOrders, search, filter]);
  const visibleProducts = useMemo(() => products.filter((p) => `${p.title} ${p.handle} ${p.rawDate || ""}`.toLowerCase().includes(search.trim().toLowerCase())), [products, search]);
  const pickupCount = preorderOrders.filter((o) => o.fulfillmentMethod === "pickup").length;
  const unitCount = preorderOrders.reduce((sum, o) => sum + o.items.filter((item) => item.productId && preorderIds.has(item.productId)).reduce((n, item) => n + item.quantity, 0), 0);

  async function openOrder(order: Order) {
    setSelectedProduct(null);
    setSelectedOrder(order);
    setDetail(null);
    setDetailError("");
    setSuccess("");
    setTrackingNumber("");
    setCarrier("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/orders/${order.legacyResourceId}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load order");
      setDetail(data.order);
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Unable to load order");
    } finally {
      setDetailLoading(false);
    }
  }

  async function openProduct(product: Product) {
    setSelectedOrder(null);
    setSelectedProduct(product);
    setProductOrders([]);
    setProductLoading(true);
    try {
      const response = await fetch(`/api/product-orders?productId=${encodeURIComponent(product.id)}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load product orders");
      setProductOrders(data.orders || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load product orders");
    } finally {
      setProductLoading(false);
    }
  }

  async function performAction(action: "ready_for_pickup" | "ship") {
    if (!selectedOrder || submitting) return;
    setSubmitting(true);
    setDetailError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/orders/${selectedOrder.legacyResourceId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, trackingNumber, carrier }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Shopify could not update this order");
      setDetail(data.order);
      setSuccess(action === "ship" ? "Shipment created in Shopify. The customer was notified." : "Marked ready for pickup in Shopify. The customer was notified.");
      await refresh();
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Shopify could not update this order");
    } finally {
      setSubmitting(false);
    }
  }

  const openFulfillments = detail?.fulfillmentOrders.nodes.filter((fo) => fo.status === "OPEN") || [];
  const blockedFulfillments = !!detail && (detail.fulfillmentOrders.pageInfo.hasNextPage || detail.fulfillmentOrders.nodes.some((fo) => !["OPEN", "CLOSED", "CANCELLED"].includes(fo.status)));
  const canPickup = !!detail && !blockedFulfillments && openFulfillments.length > 0 && openFulfillments.every((fo) => fo.deliveryMethod?.methodType === "PICK_UP");
  const canShip = !!detail && !blockedFulfillments && openFulfillments.length === 1 && openFulfillments[0].deliveryMethod?.methodType === "SHIPPING" && openFulfillments[0].supportedActions.some((a) => a.action === "CREATE_FULFILLMENT");

  return (
    <main className="min-h-screen bg-[#0b1220] text-slate-100">
      <div className="mx-auto max-w-[1600px] px-5 pb-20 pt-7 md:px-9">
        <header className="mb-9 flex flex-wrap items-center justify-between gap-5 border-b border-white/10 pb-7">
          <div className="flex items-center gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-300 text-xl font-black text-[#0b1220]">G3</div><div><p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">Game 3 / Operations</p><h1 className="text-2xl font-semibold tracking-tight text-white">Preorder workspace</h1></div></div>
          <button onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50">{loading ? "Syncing…" : "↻  Refresh orders"}</button>
        </header>

        <div className="mb-8"><p className="text-sm text-slate-400">A clear view of every open preorder, from arrival to pickup or shipment.</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">Today’s queue</h2></div>
        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Open preorder orders" value={preorderOrders.length} hint="Across your preorder collection" />
          <Stat label="Pickup queue" value={pickupCount} hint="Customer collection" />
          <Stat label="Preorder units" value={unitCount} hint="Still unfulfilled" />
        </section>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex rounded-xl border border-white/10 bg-white/5 p-1"><button onClick={() => setTab("orders")} className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${tab === "orders" ? "bg-cyan-300 text-[#0b1220]" : "text-slate-400 hover:text-white"}`}>Orders</button><button onClick={() => setTab("products")} className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${tab === "products" ? "bg-cyan-300 text-[#0b1220]" : "text-slate-400 hover:text-white"}`}>Products</button></div>
          <div className="flex w-full flex-wrap gap-3 sm:w-auto"><input aria-label="Search orders and products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, product, SKU…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#151e2c] px-4 py-2.5 text-sm outline-none placeholder:text-slate-500 focus:border-cyan-300 sm:w-72" />{tab === "orders" && <select aria-label="Delivery method" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="rounded-xl border border-white/10 bg-[#151e2c] px-3 py-2.5 text-sm text-slate-200"><option value="all">All methods</option><option value="pickup">Pickup</option><option value="shipping">Shipping</option></select>}</div>
        </div>

        {error && <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error} <button onClick={() => void refresh()} className="ml-2 underline">Retry</button></div>}
        {loading && !orders.length && !products.length ? <div className={`${surface} p-12 text-center text-slate-400`}>Loading your preorder queue from Shopify…</div> : tab === "orders" ? (
          <section className={`${surface} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><h3 className="font-semibold text-white">Open orders</h3><span className="text-xs text-slate-400">{visibleOrders.length} shown</span></div>
            {visibleOrders.length ? visibleOrders.map((order) => <button key={order.id} onClick={() => void openOrder(order)} className="flex w-full flex-wrap items-center gap-4 border-b border-white/[.06] px-5 py-4 text-left transition last:border-0 hover:bg-white/[.05] focus:bg-white/[.05] focus:outline-none sm:flex-nowrap">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[.06] text-lg text-slate-300">{order.fulfillmentMethod === "pickup" ? "⌂" : "↗"}</span>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-3"><strong className="text-white">{order.name}</strong><Badge method={order.fulfillmentMethod} /></span><span className="mt-1 block truncate text-sm text-slate-400">{order.items.map((item) => `${item.quantity}× ${item.title}`).join(" · ")}</span></span>
              <span className="hidden shrink-0 text-right text-xs text-slate-400 md:block">{formatDate(order.createdAt)}<br /><span className="text-slate-500">{order.items.reduce((sum, item) => sum + item.quantity, 0)} units</span></span><span className="ml-auto text-cyan-300">→</span>
            </button>) : <Empty text={search ? "No orders match your search." : "No open preorder orders in this view."} />}
          </section>
        ) : <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleProducts.length ? visibleProducts.map((product) => <button key={product.id} onClick={() => void openProduct(product)} className={`${surface} flex min-h-36 gap-4 p-4 text-left transition hover:border-cyan-300/40 hover:bg-[#1b2737]`}><img src={product.image || "/favicon.ico"} alt="" className="h-24 w-24 shrink-0 rounded-xl bg-white/5 object-cover" /><span className="flex min-w-0 flex-col"><span className="line-clamp-2 font-semibold text-white">{product.title}</span><span className="mt-2 text-xs text-slate-400">{product.rawDate || "Release date TBA"}</span><span className="mt-auto text-sm font-medium text-cyan-300">{product.orderCount} units on open orders →</span></span></button>) : <div className={`${surface} col-span-full`}><Empty text="No products match your search." /></div>}</section>}
      </div>

      {selectedOrder && <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1220]" role="dialog" aria-modal="true" aria-label={`Order ${selectedOrder.name}`}>
        <div className="mx-auto max-w-[1500px] px-5 pb-20 pt-7 md:px-9">
          <button onClick={() => setSelectedOrder(null)} className="mb-8 text-sm font-medium text-slate-400 hover:text-white">← Back to workspace</button>
          <div className="mb-8 flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Order workspace</p><h2 className="mt-2 text-4xl font-semibold tracking-tight text-white">{selectedOrder.name}</h2><p className="mt-2 text-sm text-slate-400">Placed {formatDate(selectedOrder.createdAt)} · {selectedOrder.shippingMethod}</p></div><a href={selectedOrder.adminUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10">Open in Shopify ↗</a></div>
          {detailError && <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{detailError}</div>}
          {success && <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">✓ {success}</div>}
          {detailLoading ? <div className={`${surface} p-10 text-slate-400`}>Loading customer and fulfillment details…</div> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
            <div className="space-y-5"><section className={`${surface} p-6`}><SectionTitle eyebrow="Items to fulfill" title={`${selectedOrder.items.reduce((n, item) => n + item.quantity, 0)} units in this order`} /><div className="mt-5 divide-y divide-white/10">{selectedOrder.items.map((item, index) => <div key={index} className="flex gap-4 py-4"><img src={item.image || "/favicon.ico"} alt="" className="h-16 w-16 rounded-lg bg-white/5 object-cover" /><div className="min-w-0 flex-1"><p className="font-medium text-white">{item.title}</p><p className="mt-1 text-sm text-slate-400">{item.variantTitle || "Default variant"}{item.sku ? ` · SKU ${item.sku}` : ""}</p></div><span className="font-semibold text-cyan-300">× {item.quantity}</span></div>)}</div></section>
              <section className={`${surface} p-6`}><SectionTitle eyebrow="Fulfillment" title="Next action" />{!detail ? <p className="mt-4 text-sm text-slate-400">Order details are unavailable. You can manage it in Shopify.</p> : canPickup ? <div className="mt-5"><p className="mb-5 text-sm leading-6 text-slate-400">Items are ready at the counter? Marking them ready updates Shopify and sends its ready-for-pickup notification.</p><button disabled={submitting} onClick={() => void performAction("ready_for_pickup")} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-[#0b1220] hover:bg-cyan-200 disabled:opacity-50">{submitting ? "Updating Shopify…" : "Mark ready for pickup"}</button></div> : canShip ? <div className="mt-5 space-y-4"><p className="text-sm leading-6 text-slate-400">Create the fulfillment in Shopify and email the tracking details to the customer.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-400">Carrier (optional)<input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="FedEx, Canada Post…" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300" /></label><label className="text-xs font-medium text-slate-400">Tracking number<input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Enter tracking number" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300" /></label></div><button disabled={submitting || !trackingNumber.trim()} onClick={() => void performAction("ship")} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-[#0b1220] hover:bg-cyan-200 disabled:opacity-50">{submitting ? "Updating Shopify…" : "Mark shipped & notify customer"}</button></div> : <p className="mt-4 text-sm leading-6 text-slate-400">{openFulfillments.length ? "This order has multiple locations, a different delivery method, or a fulfillment hold. Complete it in Shopify." : "There are no open fulfillments for this order. It may already be ready, shipped, or fulfilled."}</p>}</section></div>
            <div className="space-y-5"><section className={`${surface} p-6`}><SectionTitle eyebrow="Customer" title={detail?.shippingAddress?.name || detail?.billingAddress?.name || "Customer details"} /><div className="mt-5 space-y-4 text-sm"><DetailRow label="Email" value={detail?.email} link={detail?.email ? `mailto:${detail.email}` : undefined} /><DetailRow label="Phone" value={detail?.phone || detail?.shippingAddress?.phone || detail?.billingAddress?.phone} link={detail?.phone ? `tel:${detail.phone}` : undefined} /></div></section><section className={`${surface} p-6`}><SectionTitle eyebrow="Delivery" title={selectedOrder.fulfillmentMethod === "pickup" ? "In-store pickup" : "Shipping address"} /><AddressView address={detail?.shippingAddress} pickup={selectedOrder.fulfillmentMethod === "pickup"} /></section>{detail?.note && <section className={`${surface} p-6`}><SectionTitle eyebrow="Order note" title="Instructions" /><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">{detail.note}</p></section>}{!!detail?.tags.length && <section className={`${surface} p-6`}><SectionTitle eyebrow="Labels" title="Shopify tags" /><div className="mt-4 flex flex-wrap gap-2">{detail.tags.map((tag) => <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">{tag}</span>)}</div></section>}</div>
          </div>}
        </div>
      </div>}

      {selectedProduct && <div className="fixed inset-0 z-40 flex justify-end bg-black/65" role="dialog" aria-modal="true" aria-label={`Orders for ${selectedProduct.title}`}><button aria-label="Close product panel" onClick={() => setSelectedProduct(null)} className="flex-1" /><aside className="h-full w-full max-w-[680px] overflow-y-auto border-l border-white/10 bg-[#111a28] p-6 shadow-2xl md:p-8"><button onClick={() => setSelectedProduct(null)} className="mb-7 text-sm text-slate-400 hover:text-white">← Close panel</button><div className="flex gap-5"><img src={selectedProduct.image || "/favicon.ico"} alt="" className="h-24 w-24 rounded-xl object-cover" /><div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Product / Open orders</p><h2 className="mt-2 text-2xl font-semibold text-white">{selectedProduct.title}</h2><p className="mt-2 text-sm text-slate-400">{selectedProduct.rawDate || "Release date TBA"} · {selectedProduct.orderCount} units</p></div></div><div className="mt-8 border-t border-white/10 pt-6"><h3 className="mb-4 font-semibold">Customer orders</h3>{productLoading ? <p className="text-sm text-slate-400">Loading orders…</p> : productOrders.length ? productOrders.map((order) => <button key={order.orderName} onClick={() => { const match = orders.find((item) => item.legacyResourceId === order.orderId); if (match) void openOrder(match); }} className="mb-3 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[.04] p-4 text-left hover:border-cyan-300/40"><span><span className="font-semibold text-white">{order.orderName}</span><span className="mt-1 block text-xs text-slate-400">{formatDate(order.date)} · {order.fulfillmentMethod === "pickup" ? "Pickup" : "Shipping"}</span></span><span className="text-sm font-semibold text-cyan-300">× {order.quantity} →</span></button>) : <Empty text="No unfulfilled orders for this product." />}</div></aside></div>}
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) { return <div className={`${surface} p-5`}><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold text-white">{value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>; }
function Badge({ method }: { method: "pickup" | "shipping" }) { return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${method === "pickup" ? "bg-amber-300/10 text-amber-200" : "bg-sky-300/10 text-sky-200"}`}>{method === "pickup" ? "Pickup" : "Shipping"}</span>; }
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) { return <div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">{eyebrow}</p><h3 className="mt-2 text-xl font-semibold text-white">{title}</h3></div>; }
function DetailRow({ label, value, link }: { label: string; value?: string | null; link?: string }) { return <div><p className="text-xs text-slate-500">{label}</p>{link && value ? <a href={link} className="mt-1 block break-all text-cyan-300 hover:underline">{value}</a> : <p className="mt-1 text-slate-200">{value || "Not provided"}</p>}</div>; }
function AddressView({ address, pickup }: { address?: Address | null; pickup: boolean }) { if (pickup) return <p className="mt-4 text-sm text-slate-400">Customer will collect this order in store.</p>; if (!address) return <p className="mt-4 text-sm text-slate-400">No shipping address was provided.</p>; return <address className="mt-4 text-sm not-italic leading-7 text-slate-300">{address.name}<br />{address.company && <>{address.company}<br /></>}{address.address1}<br />{address.address2 && <>{address.address2}<br /></>}{[address.city, address.province, address.zip].filter(Boolean).join(", ")}<br />{address.country}</address>; }
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-sm text-slate-400">{text}</div>; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }); }
