/** Inventory vs purchase source for asset requests (requisitions). */

export function getInventoryAvailable(row) {
  if (!row) return null;
  const v = row.inventory_available ?? row.inventoryAvailable;
  if (v === true || v === 'true' || v === 1) return true;
  if (v === false || v === 'false' || v === 0) return false;
  return null; // not checked yet (e.g. still pending Line Manager)
}

export function inventorySourceLabel(row) {
  const v = getInventoryAvailable(row);
  if (v === true) return 'Available in Inventory';
  if (v === false) return 'Need Purchase';
  return 'Inventory check pending';
}

export function inventorySourceBadgeClass(row) {
  const v = getInventoryAvailable(row);
  if (v === true) return 'badge badge-resolved';
  if (v === false) return 'badge badge-rejected';
  return 'badge badge-hold';
}

export function inventorySourceHint(row) {
  const v = getInventoryAvailable(row);
  if (v === true) return 'Item matched active inventory stock — prefer assign/fulfill from stock.';
  if (v === false) return 'No matching stock — vendor purchase / pricing path.';
  return 'Checked automatically after Line Manager approval.';
}
