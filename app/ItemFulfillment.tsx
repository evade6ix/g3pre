import { lineItemQuantities, type FulfillmentQuantities } from "../lib/line-items";

export default function ItemFulfillment({ item }: { item: FulfillmentQuantities }) {
  const { remaining, fulfilled, removed } = lineItemQuantities(item);
  const label = remaining > 0
    ? fulfilled > 0 ? `Partially fulfilled · ${fulfilled} fulfilled · ${remaining} remaining` : `Unfulfilled · ${remaining} remaining`
    : fulfilled > 0 ? `Fulfilled · ${fulfilled} fulfilled` : "Refunded / removed";
  return <span className="mt-1 flex flex-wrap gap-2 text-xs">
    <span className={`rounded-md px-2 py-1 ${remaining > 0 ? "bg-amber-300/10 text-amber-200" : fulfilled > 0 ? "bg-emerald-400/10 text-emerald-200" : "bg-white/5 text-slate-400"}`}>{label}</span>
    {removed > 0 && fulfilled + remaining > 0 && <span className="rounded-md bg-white/5 px-2 py-1 text-slate-400">{removed} refunded / removed</span>}
  </span>;
}
