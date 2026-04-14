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

type Order = {
  orderName: string;
  date: string;
  quantity: number;
  revenue?: number | null;
  adminUrl?: string | null;
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

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"release" | "orders" | "revenue">("release");

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
    } else if (sortMode === "revenue") {
      sorted.sort((a, b) => {
        const aRevenue = a.revenue ?? 0;
        const bRevenue = b.revenue ?? 0;
        if (bRevenue !== aRevenue) return bRevenue - aRevenue;
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

  const totalRevenue = useMemo(() => {
    return filteredProducts.reduce((sum, product) => sum + (product.revenue ?? 0), 0);
  }, [filteredProducts]);

  const topProduct = useMemo(() => {
    if (!filteredProducts.length) return null;
    return [...filteredProducts].sort((a, b) => b.orderCount - a.orderCount)[0];
  }, [filteredProducts]);

  const topRevenueProduct = useMemo(() => {
    const withRevenue = filteredProducts.filter(
      (product) => typeof product.revenue === "number" && (product.revenue ?? 0) > 0
    );

    if (!withRevenue.length) return null;
    return [...withRevenue].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))[0];
  }, [filteredProducts]);

  const upcomingSoonest = useMemo(() => {
    if (!filteredProducts.length) return null;
    return [...filteredProducts].sort(
      (a, b) => safeDate(a.rawDate) - safeDate(b.rawDate)
    )[0];
  }, [filteredProducts]);

  const drawerTotalUnits = useMemo(() => {
    return orders.reduce((sum, order) => sum + order.quantity, 0);
  }, [orders]);

  const drawerTotalRevenue = useMemo(() => {
    return orders.reduce((sum, order) => sum + (order.revenue ?? 0), 0);
  }, [orders]);

  const drawerLatestOrderDate = useMemo(() => {
    if (!orders.length) return null;
    const sorted = [...orders].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return sorted[0]?.date ?? null;
  }, [orders]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#13233f_0%,#08111f_45%,#050b15_100%)] text-white">
        <div className="mx-auto max-w-[1680px] px-5 py-6 sm:px-6 lg:px-8">
          <div className="mb-8 rounded-[30px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="h-4 w-28 animate-pulse rounded-full bg-white/10" />
            <div className="mt-4 h-12 w-72 animate-pulse rounded-2xl bg-white/10" />
            <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-xl bg-white/10" />
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]"
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]"
              >
                <div className="h-[230px] animate-pulse bg-white/10" />
                <div className="space-y-3 p-4">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-white/10" />
                  <div className="h-5 w-2/3 animate-pulse rounded bg-white/10" />
                  <div className="h-12 animate-pulse rounded-2xl bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#13233f_0%,#08111f_45%,#050b15_100%)] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-8%] h-[420px] w-[420px] rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="absolute right-[-8%] top-[12%] h-[460px] w-[460px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-[-15%] left-[25%] h-[420px] w-[420px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1680px] px-5 py-6 sm:px-6 lg:px-8">
        <section className="mb-8 overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:p-7 lg:p-8">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                Upcoming Preorders
              </h1>
            </div>

            <div className="grid w-full gap-3 md:grid-cols-[minmax(0,1fr)_auto] xl:max-w-[940px]">
              <div className="relative">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product, handle, or release date..."
                  className="h-13 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none ring-0 placeholder:text-slate-400 transition focus:border-cyan-300/40 focus:bg-black/25"
                />
              </div>

              <div className="inline-flex flex-wrap rounded-2xl border border-white/10 bg-black/20 p-1">
                <button
                  onClick={() => setSortMode("release")}
                  className={`h-11 rounded-xl px-4 text-sm font-medium transition ${
                    sortMode === "release"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  Release
                </button>
                <button
                  onClick={() => setSortMode("orders")}
                  className={`h-11 rounded-xl px-4 text-sm font-medium transition ${
                    sortMode === "orders"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  Demand
                </button>
                <button
                  onClick={() => setSortMode("revenue")}
                  className={`h-11 rounded-xl px-4 text-sm font-medium transition ${
                    sortMode === "revenue"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  Revenue
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Visible products"
            value={String(filteredProducts.length)}
            subtext="Products in the current filtered view"
          />
          <MetricCard
            label="Open orders"
            value={String(totalOpenOrders)}
            subtext="Total unfulfilled preorder orders"
          />
          <MetricCard
            label="Top demand"
            value={topProduct ? `${topProduct.orderCount}` : "0"}
            subtext={topProduct ? trimTitle(topProduct.title, 38) : "No product found"}
          />
        </section>

        {filteredProducts.length === 0 ? (
          <div className="rounded-[30px] border border-dashed border-white/12 bg-white/[0.04] px-6 py-16 text-center shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <div className="text-2xl font-semibold text-white">No products found</div>
            <div className="mt-3 text-sm text-slate-400">
              Try a different search or switch the sort mode.
            </div>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredProducts.map((product) => {
              const releaseLabel = formatReleaseLabel(product.rawDate);
              const orderLabel =
                product.orderCount === 1
                  ? "1 open order"
                  : `${product.orderCount} open orders`;

              return (
                <button
                  key={product.id}
                  onClick={() => openProduct(product)}
                  className="group relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,23,40,0.9),rgba(9,16,30,0.96))] text-left shadow-[0_18px_48px_rgba(0,0,0,0.32)] transition duration-300 hover:-translate-y-1.5 hover:border-cyan-300/30 hover:shadow-[0_28px_68px_rgba(0,0,0,0.42)]"
                >
                  <div className="relative h-[248px] overflow-hidden">
                    <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
                    <div className="absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-[#08111f] via-[#08111f]/75 to-transparent" />

                    <img
                      src={product.image || "/favicon.ico"}
                      alt={product.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.045]"
                    />

                    <div className="absolute left-4 top-4 z-20 max-w-[62%] rounded-full border border-black/10 bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)] backdrop-blur-md">
                      {releaseLabel}
                    </div>

                    <div className="absolute right-4 top-4 z-20 rounded-full border border-cyan-200/15 bg-slate-950/75 px-3 py-1.5 text-[11px] font-semibold text-cyan-100 shadow-[0_8px_20px_rgba(0,0,0,0.25)] backdrop-blur-md">
                      {product.orderCount}
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="min-h-[64px] text-[18px] font-semibold leading-7 tracking-[-0.02em] text-white">
                      <span className="line-clamp-2">{product.title}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <StatPill label="Demand" value={orderLabel} />
                      
                       
                      
                         
                        
                        
                     
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="min-w-0 pr-3">
                        <div className="truncate text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Handle
                        </div>
                        <div className="truncate text-sm text-slate-300/90">
                          {product.handle}
                        </div>
                      </div>

                      <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200 transition group-hover:border-cyan-300/25 group-hover:text-white">
                        View
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-[rgba(2,8,18,0.72)] backdrop-blur-md"
            onClick={closeDrawer}
          />

          <aside className="absolute right-0 top-0 h-full w-full max-w-[720px] overflow-hidden border-l border-white/10 bg-[linear-gradient(180deg,#0b1525_0%,#081120_100%)] shadow-[-30px_0_100px_rgba(0,0,0,0.55)]">
            <div className="flex h-full flex-col">
              <div className="border-b border-white/10 px-5 py-5 sm:px-6">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
                    Product detail
                  </div>

                  <button
                    onClick={closeDrawer}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="flex flex-col gap-5 sm:flex-row">
                  <div className="relative h-[110px] w-[110px] overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] shadow-[0_12px_30px_rgba(0,0,0,0.24)]">
                    <img
                      src={selected.image || "/favicon.ico"}
                      alt={selected.title}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-3xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-[2.4rem]">
                      {selected.title}
                    </h2>

                    <div className="mt-4 flex flex-wrap gap-2.5">
                      <InfoChip label="Release" value={selected.rawDate || "N/A"} />
                      <InfoChip
                        label="Open orders"
                        value={`${selected.orderCount} ${
                          selected.orderCount === 1 ? "order" : "orders"
                        }`}
                      />
                      <InfoChip
                        label="Units"
                        value={`${drawerTotalUnits} ${drawerTotalUnits === 1 ? "unit" : "units"}`}
                      />
                      <InfoChip
                        label="Revenue"
                        value={
                          typeof selected.revenue === "number"
                            ? formatMoney(selected.revenue)
                            : "No data"
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <DrawerMetricCard
                    label="Order count"
                    value={`${orders.length}`}
                    subtext="Matching unfulfilled orders"
                  />
                  <DrawerMetricCard
                    label="Total units"
                    value={`${drawerTotalUnits}`}
                    subtext="Units inside this drawer"
                  />
                  <DrawerMetricCard
                    label="Latest order"
                    value={drawerLatestOrderDate ? formatDate(drawerLatestOrderDate) : "—"}
                    subtext="Most recent matching order"
                  />
                </div>

                <div className="mt-6 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.025))] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.22)] sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold text-white">Outstanding Orders</div>
                      <div className="mt-1 text-sm text-slate-400">
                        Unfulfilled orders containing this product.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-cyan-300/12 bg-cyan-300/8 px-3 py-2 text-right">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/70">
                        Summary
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {orders.length} {orders.length === 1 ? "order" : "orders"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    {ordersLoading ? (
                      <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4"
                          >
                            <div className="h-5 w-28 animate-pulse rounded bg-white/10" />
                            <div className="mt-3 h-4 w-24 animate-pulse rounded bg-white/10" />
                            <div className="mt-4 h-12 animate-pulse rounded-2xl bg-white/10" />
                          </div>
                        ))}
                      </div>
                    ) : orders.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-5 py-12 text-center">
                        <div className="text-lg font-semibold text-white">No open orders found</div>
                        <div className="mt-2 text-sm text-slate-400">
                          This product currently has no matching unfulfilled orders.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {orders.map((order, index) => {
  const content = (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-lg font-semibold text-white">
            {order.orderName}
          </div>

          {order.adminUrl && (
            <span className="rounded-full border border-cyan-300/18 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/85">
              Shopify
            </span>
          )}
        </div>

        <div className="mt-1 text-sm text-slate-400">
          {formatDate(order.date)}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {typeof order.revenue === "number" && (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-4 py-2.5 text-center">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
              Revenue
            </div>
            <div className="mt-1 text-sm font-semibold leading-none text-white">
              {formatMoney(order.revenue)}
            </div>
          </div>
        )}

        <div className="rounded-[18px] border border-cyan-300/18 bg-cyan-300/10 px-4 py-2.5 text-center">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/75">
            Qty
          </div>
          <div className="mt-1 text-xl font-semibold leading-none text-white">
            {order.quantity}
          </div>
        </div>
      </div>
    </div>
  );

  if (order.adminUrl) {
    return (
      <a
        key={`${order.orderName}-${index}`}
        href={order.adminUrl}
        target="_blank"
        rel="noreferrer"
        className="block cursor-pointer rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(16,28,48,0.95),rgba(10,19,35,0.98))] p-4 shadow-[0_12px_26px_rgba(0,0,0,0.18)] transition hover:-translate-y-[1px] hover:border-cyan-300/30 hover:bg-[linear-gradient(135deg,rgba(18,32,55,0.98),rgba(10,19,35,1))]"
      >
        {content}
      </a>
    );
  }

  return (
    <div
      key={`${order.orderName}-${index}`}
      className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(16,28,48,0.95),rgba(10,19,35,0.98))] p-4 shadow-[0_12px_26px_rgba(0,0,0,0.18)]"
    >
      {content}
    </div>
  );
})}
                      </div>
                    )}
                  </div>
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
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.03))] p-5 shadow-[0_16px_44px_rgba(0,0,0,0.24)] backdrop-blur-xl">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{subtext}</div>
    </div>
  );
}

function DrawerMetricCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{subtext}</div>
    </div>
  );
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 line-clamp-1 text-sm font-medium text-slate-200">{value}</div>
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
    <div className="rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm text-slate-200">
      <span className="text-slate-400">{label}: </span>
      <span className="text-white">{value}</span>
    </div>
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
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatReleaseLabel(value: string | null) {
  if (!value) return "No release date";
  return value;
}

function trimTitle(value: string, max: number) {
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