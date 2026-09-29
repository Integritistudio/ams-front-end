'use client';

import {
  inventorySourceBadgeClass,
  inventorySourceHint,
  inventorySourceLabel,
  getInventoryAvailable,
} from '../lib/inventorySource';

/**
 * Decision-aid badge: Available in Inventory / Need Purchase.
 * Hide for Staff; show for IT Admin, Finance, HR, GM, Executive, Super Admin.
 */
export default function InventorySourceBadge({
  row,
  show = true,
  compact = false,
  className = '',
}) {
  if (!show || !row) return null;
  const label = inventorySourceLabel(row);
  const hint = inventorySourceHint(row);
  const available = getInventoryAvailable(row);

  return (
    <span
      className={`${inventorySourceBadgeClass(row)} ${className}`.trim()}
      title={hint}
      style={compact ? undefined : { display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <i
        className={`fa-solid ${
          available === true ? 'fa-boxes-stacked' : available === false ? 'fa-cart-shopping' : 'fa-clock'
        }`}
        aria-hidden
      />
      {label}
    </span>
  );
}
