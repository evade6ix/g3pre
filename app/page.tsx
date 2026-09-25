"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Product = {
  id: string;
  title: string;
  handle: string;
  image: string | null;
  rawDate: string | null;
  orderCount: number;
  revenue?: number | null;
};

type OrderItem = {
  title?: string | null;
  variantTitle?: string | null;
  sku?: string | null;
  quantity?: number | null;
  image?: string | null;
};

type Order = {
  orderName: string;
  date: string;
  quantity: number;
  adminUrl?: string | null;
  fulfillmentMethod?: "shipping" | "pickup" | string | null;
  shippingMethodLabel?: string | null;
  revenue?: number | null;
  items?: OrderItem[] | null;
};

type PreordersResponse = {
  ok: boolean;
  count: number;
  products: Product[];
};

type ProductOrdersResponse = {
  ok: boolean;
  count: number;
  orders: Order[];
};

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const ordersCache = useRef<Record<string, Order[]>>({});
  const ordersInFlight = useRef<Record<string, Promise<Order[]>>>({});
  const latestRequestedProductId = useRef<string | null>(null);

  const [selected, setSelected] = useState<Product | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"release" | "orders">("release");

  useEffect(() => {
    fetch("/api/preorders")
      .then((res) => res.json())
      .then((data: PreordersResponse) => {
        setProducts(data.products || []);
        setLoading(false);
      })
      .catch(() => {
        setProducts([]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selected) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected]);

  async function loadOrders(productId: string, force = false) {
    if (!force && ordersCache.current[productId]) {
      return ordersCache.current[productId];
    }

    if (!force) {
      const inFlight = ordersInFlight.current[productId];
      if (inFlight) {
        return inFlight;
      }
    }

    const request = fetch(
      `/api/product-orders?productId=${encodeURIComponent(productId)}`,
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load orders");
        }

        const data: ProductOrdersResponse = await res.json();
        const nextOrders = data.orders || [];
        ordersCache.current[productId] = nextOrders;
        return nextOrders;
      })
      .finally(() => {
        delete ordersInFlight.current[productId];
      });

    ordersInFlight.current[productId] = request;
    return request;
  }

  async function openProduct(product: Product) {
    setSelected(product);
    latestRequestedProductId.current = product.id;
    setExpandedOrders({});

    if (ordersCache.current[product.id]) {
      setOrders(ordersCache.current[product.id]);
      setOrdersLoading(false);
      return;
    }

    setOrders([]);
    setOrdersLoading(true);

    try {
      const nextOrders = await loadOrders(product.id);

      if (latestRequestedProductId.current === product.id) {
        setOrders(nextOrders);
      }
    } catch {
      if (latestRequestedProductId.current === product.id) {
        setOrders([]);
      }
    } finally {
      if (latestRequestedProductId.current === product.id) {
        setOrdersLoading(false);
      }
    }
  }

  function closeDrawer() {
    setSelected(null);
    setOrders([]);
    setOrdersLoading(false);
    setExpandedOrders({});
  }

  function toggleOrderExpansion(orderKey: string) {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderKey]: !prev[orderKey],
    }));
  }

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = products.filter((product) => {
      if (!q) return true;
      return (
        product.title.toLowerCase().includes(q) ||
        product.handle.toLowerCase().includes(q) ||
        (product.rawDate || "").toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered];

    if (sortMode === "orders") {
      sorted.sort((a, b) => {
        if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
        return safeDate(a.rawDate) - safeDate(b.rawDate);
      });
    } else {
      sorted.sort((a, b) => safeDate(a.rawDate) - safeDate(b.rawDate));
    }

    return sorted;
  }, [products, search, sortMode]);

  const totalOpenOrders = useMemo(() => {
    return filteredProducts.reduce((sum, product) => sum + product.orderCount, 0);
  }, [filteredProducts]);

  const topProduct = useMemo(() => {
    if (!filteredProducts.length) return null;
    return [...filteredProducts].sort((a, b) => b.orderCount - a.orderCount)[0];
  }, [filteredProducts]);

  const upcomingSoonest = useMemo(() => {
    const upcoming = filteredProducts.filter((product) => safeDate(product.rawDate) >= Date.now() && safeDate(product.rawDate) !== Number.MAX_SAFE_INTEGER);
    if (!upcoming.length) return null;
    return [...upcoming].sort(
      (a, b) => safeDate(a.rawDate) - safeDate(b.rawDate)
    )[0];
  }, [filteredProducts]);

  const drawerTotalUnits = useMemo(() => {
    return orders.reduce((sum, order) => sum + order.quantity, 0);
  }, [orders]);

  const drawerLatestOrderDate = useMemo(() => {
    if (!orders.length) return null;
    const sorted = [...orders].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return sorted[0]?.date ?? null;
  }, [orders]);

const pickupCount = useMemo(() => {
  return orders.filter((order) => getOrderMethod(order) === "pickup").length;
}, [orders]);

const shippingCount = useMemo(() => {
  return orders.filter((order) => getOrderMethod(order) === "shipping").length;
}, [orders]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <div className="mx-auto max-w-[1920px] px-6 py-8 sm:px-8 lg:px-10">
          <div className="mb-12 flex flex-col items-center text-center">
            <div className="h-3 w-32 animate-pulse rounded-full bg-slate-800" />
            <div className="mt-5 h-12 w-[340px] max-w-full animate-pulse rounded-2xl bg-slate-800" />
            <div className="mt-4 h-14 w-full max-w-2xl animate-pulse rounded-2xl bg-slate-800" />
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900"
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-slate-800"
              >
                <div className="h-56 animate-pulse bg-slate-800" />
                <div className="space-y-2 border-t border-slate-800 p-4">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-slate-800" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-[1920px] px-6 py-8 sm:px-8 lg:px-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Active Preorders
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
            View "Unfulfilled" orders - does not work for "fulfilled"
          </p>
        </div>

        <div className="mb-8 flex flex-col items-center gap-5">
          <div className="w-full max-w-3xl">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product title, handle, or release date…"
              className="h-14 w-full rounded-2xl border border-slate-700 bg-slate-900/70 px-5 text-base text-white placeholder:text-slate-500 outline-none transition focus:border-slate-500 focus:bg-slate-900"
            />
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {[
              { mode: "release", label: "Release" },
              { mode: "orders", label: "Demand" },
            ].map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode as "release" | "orders")}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  sortMode === mode
                    ? "bg-slate-50 text-slate-950"
                    : "border border-slate-700 text-slate-300 hover:bg-slate-800/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          <MetricCard
            label="Products"
            value={filteredProducts.length.toString()}
            context="In current view"
          />
          <MetricCard
            label="Open Orders"
            value={totalOpenOrders.toString()}
            context={topProduct ? `Led by ${truncate(topProduct.title, 32)}` : "No products"}
          />
          <MetricCard
            label="Next Release"
            value={upcomingSoonest ? formatReleaseLabel(upcomingSoonest.rawDate) : "TBA"}
            context={upcomingSoonest ? truncate(upcomingSoonest.title, 30) : "No product found"}
          />
        </div>

        {filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-8 py-16 text-center">
            <div className="text-lg font-medium text-white">No products found</div>
            <div className="mt-2 text-sm text-slate-400">
              Adjust your search or switch the sort order.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => openProduct(product)}
                className="group relative overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 text-left outline-none transition hover:-translate-y-0.5 hover:border-slate-600 hover:shadow-lg focus:ring-2 focus:ring-slate-600 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                <div className="relative h-56 overflow-hidden bg-slate-800">
                  <img
                    src={product.image || "/favicon.ico"}
                    alt={product.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />

                  <div className="absolute left-3 top-3 flex gap-2">
                    <div className="rounded-full border border-slate-600/40 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
                      {formatReleaseLabel(product.rawDate)}
                    </div>
                  </div>

                  <div className="absolute right-3 top-3">
                    <div className="rounded-full border border-slate-600/40 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-100 backdrop-blur-sm">
                      {product.orderCount}
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-700/60 p-5">
                  <h3 className="line-clamp-2 text-base font-semibold leading-tight text-white">
                    {product.title}
                  </h3>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500">
                        Demand
                      </div>
                      <div className="mt-1 text-sm font-medium text-slate-200">
                        {product.orderCount} {product.orderCount === 1 ? "order" : "orders"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500">
                        Handle
                      </div>
                      <div className="mt-1 truncate text-sm font-medium text-slate-200">
                        {product.handle}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end">
                    <div className="shrink-0 rounded-xl border border-slate-600/40 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-300 transition group-hover:bg-slate-700">
                      View Orders
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition"
            onClick={closeDrawer}
          />

          <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-hidden border-l border-slate-700 bg-slate-900 shadow-2xl sm:max-w-xl">
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-700/60 px-6 py-5">
                <div className="mb-5 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Product Details
                  </div>
                  <button
                    onClick={closeDrawer}
                    className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-slate-200"
                  >
                    Close
                  </button>
                </div>

                <div className="flex gap-5">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
                    <img
                      src={selected.image || "/favicon.ico"}
                      alt={selected.title}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-semibold text-white">
                      {selected.title}
                    </h2>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <InfoChip label="Release" value={selected.rawDate || "N/A"} />
                      <InfoChip
                        label="Orders"
                        value={`${selected.orderCount} ${
                          selected.orderCount === 1 ? "order" : "orders"
                        }`}
                      />
                      <InfoChip label="Units" value={`${drawerTotalUnits}`} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="border-b border-slate-700/60 px-6 py-6">
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <DrawerMetricCard
    label="Total units"
    value={drawerTotalUnits.toString()}
  />
  <DrawerMetricCard
    label="Order count"
    value={orders.length.toString()}
  />
  <DrawerMetricCard
    label="Shipping"
    value={shippingCount.toString()}
  />
  <DrawerMetricCard
    label="Pickup"
    value={pickupCount.toString()}
  />
</div>

                  <div className="mt-4">
                    <DrawerMetricCard
                      label="Latest order"
                      value={drawerLatestOrderDate ? formatDate(drawerLatestOrderDate) : "—"}
                    />
                  </div>
                </div>

                <div className="px-6 py-6">
                  <div className="mb-4 flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold text-white">Outstanding Orders</h3>
                    <div className="text-xs font-medium text-slate-400">
                      {orders.length} {orders.length === 1 ? "order" : "orders"}
                    </div>
                  </div>

                  {ordersLoading ? (
                    <div className="space-y-3">
                      {[...Array(4)].map((_, i) => (
                        <div
                          key={i}
                          className="h-20 animate-pulse rounded-xl border border-slate-700 bg-slate-800"
                        />
                      ))}
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="rounded-xl border border-slate-700 bg-slate-800/30 px-4 py-8 text-center">
                      <div className="text-sm text-slate-400">
                        No unfulfilled orders for this product.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {orders.map((order, index) => {
                        const orderKey = `${order.orderName}-${index}`;
                        const expanded = !!expandedOrders[orderKey];
                        const method = getOrderMethod(order);
                        const hasItems = Array.isArray(order.items) && order.items.length > 0;

                        return (
                          <div
                            key={orderKey}
                            className="overflow-hidden rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900/60 to-slate-950/60"
                          >
                            <div className="p-4">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-semibold text-white">
                                      {order.orderName}
                                    </div>

                                    <span
  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
    method === "pickup"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : "border-sky-500/30 bg-sky-500/10 text-sky-300"
  }`}
>
  {getOrderMethodLabel(order)}
</span>

                                    {order.adminUrl && (
                                      <span className="rounded-full border border-slate-600/40 bg-slate-800/60 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                                        Shopify
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
  <span>{formatDate(order.date)}</span>
</div>
                                </div>

                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                  {typeof order.revenue === "number" && (
                                    <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-right">
                                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                                        Order Value
                                      </div>
                                      <div className="mt-0.5 text-sm font-semibold text-white">
                                        {formatMoney(order.revenue)}
                                      </div>
                                    </div>
                                  )}

                                  <div className="rounded-xl border border-slate-600/40 bg-slate-800/60 px-3 py-2 text-right">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                                      Qty
                                    </div>
                                    <div className="mt-0.5 text-sm font-semibold text-white">
                                      {order.quantity}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleOrderExpansion(orderKey)}
                                  className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                                >
                                  {expanded ? "Hide order items" : "View order items"}
                                </button>

                                {order.adminUrl && (
                                  <a
                                    href={order.adminUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
                                  >
                                    Open in Shopify
                                  </a>
                                )}
                              </div>
                            </div>

                            {expanded && (
                              <div className="border-t border-slate-700/70 bg-slate-950/40 p-4">
                                {hasItems ? (
                                  <div className="space-y-3">
                                    {(order.items || []).map((item, itemIndex) => (
                                      <div
                                        key={`${orderKey}-item-${itemIndex}`}
                                        className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3"
                                      >
                                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-800 bg-slate-800">
                                          {item.image ? (
                                            <img
                                              src={item.image}
                                              alt={item.title || "Order item"}
                                              className="h-full w-full object-cover"
                                            />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
                                              No image
                                            </div>
                                          )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-sm font-medium text-white">
                                            {item.title || "Untitled item"}
                                          </div>

                                          {item.variantTitle ? (
                                            <div className="mt-1 truncate text-xs text-slate-400">
                                              {item.variantTitle}
                                            </div>
                                          ) : null}

                                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                                            <span>Qty: {item.quantity ?? 0}</span>
                                            {item.sku ? <span>SKU: {item.sku}</span> : null}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
                                    No item-level details were returned for this order yet.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  context,
}: {
  label: string;
  value: string;
  context: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900/80 to-slate-950 p-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{context}</div>
    </div>
  );
}

function DrawerMetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function InfoChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-slate-700/60 bg-slate-800/50 px-3 py-1.5 text-xs">
      <span className="text-slate-400">{label}:</span>{" "}
      <span className="font-medium text-slate-100">{value}</span>
    </div>
  );
}

function getOrderMethod(order: Order): "shipping" | "pickup" {
  const methodLabel = getOrderMethodLabel(order)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const isPickup =
    methodLabel.includes("pickup in store") ||
    methodLabel.includes("pick up in store") ||
    methodLabel.includes("pickup") ||
    methodLabel.includes("pick up") ||
    methodLabel.includes("in-store") ||
    methodLabel.includes("in store") ||
    methodLabel.includes("local pickup") ||
    methodLabel.includes("local_pickup") ||
    methodLabel.includes("store pickup");

  return isPickup ? "pickup" : "shipping";
}
function getOrderMethodLabel(order: Order): string {
  return (
    order.shippingMethodLabel?.trim() ||
    order.fulfillmentMethod?.trim() ||
    "Shipping"
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatReleaseLabel(value: string | null) {
  if (!value) return "TBA";
  return value;
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function safeDate(rawDate: string | null) {
  if (!rawDate) return Number.MAX_SAFE_INTEGER;

  const cleaned = rawDate.replace(/(\d+)(st|nd|rd|th)/g, "$1");
  const parsed = new Date(cleaned);

  if (!isNaN(parsed.getTime())) {
    return parsed.getTime();
  }

  const parts = cleaned.split(" ");
  if (parts.length === 2) {
    const fallback = new Date(`${parts[0]} 1, ${parts[1]}`);
    if (!isNaN(fallback.getTime())) {
      return fallback.getTime();
    }
  }

  return Number.MAX_SAFE_INTEGER;
}
