'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import DateRangeFilter from '../../components/DateRangeFilter';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { inventoryApi } from '../../services/api';
import { emptyDateRange, rowInDateRange } from '../../lib/dateRange';

const PAGE_SIZE = 10;

function pid(row) {
  return row?.public_id || row?.publicId || row?.id;
}

const emptyForm = {
  name: '',
  type: 'Hardware',
  quantity_available: 0,
  location: '',
  notes: '',
  is_active: true,
};

export default function InventoryPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState(emptyDateRange);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.list();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load inventory', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('inventory')) return;
    load();
  }, [hasPermission, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!rowInDateRange(r, dateRange)) return false;
      if (!q) return true;
      return [pid(r), r.name, r.type, r.location, r.notes, r.is_active === false ? 'inactive' : 'active']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, dateRange]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPack = useMemo(() => ({
    headers: ['Item ID', 'Name', 'Type', 'Qty Available', 'Location', 'Notes', 'Status'],
    rows: filtered.map((r) => [
      pid(r),
      r.name || '',
      r.type || '',
      r.quantity_available ?? 0,
      r.location || '',
      r.notes || '',
      r.is_active === false ? 'Inactive' : 'Active',
    ]),
  }), [filtered]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row) {
    setEditingId(pid(row));
    setForm({
      name: row.name || '',
      type: row.type || 'Hardware',
      quantity_available: Number(row.quantity_available ?? 0),
      location: row.location || '',
      notes: row.notes || '',
      is_active: row.is_active !== false,
    });
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name?.trim()) {
      showToast('Required', 'Item name is required.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        type: form.type,
        quantity_available: Number(form.quantity_available) || 0,
        location: form.location || null,
        notes: form.notes || null,
        is_active: Boolean(form.is_active),
      };
      if (editingId) await inventoryApi.update(editingId, body);
      else await inventoryApi.create(body);
      showToast('Saved', editingId ? 'Inventory item updated.' : 'Inventory item created.', 'success');
      setOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Remove this inventory item?')) return;
    try {
      await inventoryApi.remove(id);
      showToast('Removed', 'Inventory item deleted.', 'info');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Delete failed', 'error');
    }
  }

  if (!hasPermission('inventory')) {
    return (
      <AppShell title="Inventory Management" subtitle="Stock of hardware and software assets.">
        <AccessDenied moduleName="Inventory Management" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Inventory Management"
      subtitle="Track available hardware and software stock."
      actions={(
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <i className="fa-solid fa-plus" /><span>Add Item</span>
        </button>
      )}
    >
      <div className="table-toolbar">
        <div className="toolbar-left"><h2>Inventory Items</h2></div>
        <div className="toolbar-controls-group">
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search inventory..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <DateRangeFilter
            value={dateRange}
            onChange={(next) => { setDateRange(next); setPage(1); }}
          />
          <TableExportButtons
            filename="inventory"
            title="Inventory Items"
            headers={exportPack.headers}
            rows={exportPack.rows}
          />
        </div>
      </div>

      <div className="table-container">
        <table className="helpdesk-table">
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Qty Available</th>
              <th>Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={7} label="Loading inventory..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={7}><EmptyState text="No inventory items found." /></td></tr>
            ) : (
              pageRows.map((r) => (
                <tr key={pid(r)}>
                  <td><strong>#{pid(r)}</strong></td>
                  <td>{r.name}</td>
                  <td>{r.type || '—'}</td>
                  <td>{r.quantity_available ?? 0}</td>
                  <td>{r.location || '—'}</td>
                  <td>
                    <span className={statusBadgeClass(r.is_active === false ? 'Inactive' : 'Active')}>
                      {r.is_active === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                      <i className="fa-solid fa-pen" />
                    </button>{' '}
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(pid(r))}>
                      <i className="fa-solid fa-trash" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />

      <Modal
        open={open}
        title={editingId ? 'Edit Inventory Item' : 'Add Inventory Item'}
        icon="fa-boxes-stacked"
        onClose={() => setOpen(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" form="inventoryForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-floppy-disk" /><span>{saving ? 'Saving...' : 'Save Item'}</span>
            </button>
          </>
        )}
      >
        <form id="inventoryForm" onSubmit={submit} autoComplete="off">
          <div className="form-grid-2">
            <div className="form-group">
              <label>Item Name *</label>
              <input
                className="form-control"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Type *</label>
              <select
                className="form-control form-control-select"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
              </select>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Quantity Available *</label>
              <input
                type="number"
                className="form-control"
                min={0}
                required
                value={form.quantity_available}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  quantity_available: e.target.value === '' ? '' : Number(e.target.value),
                }))}
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                className="form-control form-control-select"
                value={form.is_active ? 'Active' : 'Inactive'}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'Active' }))}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Location</label>
            <input
              className="form-control"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Main Store / Floor 2"
            />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea
              className="form-control"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
