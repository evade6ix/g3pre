export type FulfillmentQuantities = {
  quantity?: number | null;
  currentQuantity?: number | null;
  unfulfilledQuantity?: number | null;
};

export function lineItemQuantities(item: FulfillmentQuantities) {
  const ordered = Math.max(0, item.quantity ?? 0);
  const current = Math.max(0, Math.min(ordered, item.currentQuantity ?? ordered));
  // Refunded/removed units must not become either items to pack or fulfilled units.
  const remaining = Math.max(0, Math.min(current, item.unfulfilledQuantity ?? current));
  return { ordered, remaining, fulfilled: current - remaining, removed: ordered - current };
}

export function remainingQuantity(item: FulfillmentQuantities) {
  return lineItemQuantities(item).remaining;
}
