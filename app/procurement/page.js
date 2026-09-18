'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { procurementApi, vendorsApi } from '../../services/api';

const PAGE_SIZE = 10;

function pid(r) {
  return r?.public_id || r?.publicId || r?.id;
}

const emptyForm = {
  item_name: '',
  vendor: '',
  cost: '',
  brand: '',
  serial_number: '',
  approval_date: '',
  delivery_date: '',
  approver: '',
  assigned_user_email: '',
  department: '',
  description: '',
  status: 'Delivered / Fulfilled',
};

export default function ProcurementPage() {
  const { hasPermission, canViewAll } = useAuth();
  const { showToast } = useToast();
  const canEdit = hasPermission('assign_assets') || canViewAll('procurement_log');

  const [rows, setRows] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await procurementApi.list();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load procurement log', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('procurement_log')) return;
    load();
    vendorsApi.list().then((res) => setVendors(res.data || [])).catch(() => {});
  }, [hasPermission, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [pid(r), r.item_name || r.itemName, r.vendor, r.assigned_user_email || r.assignedUserEmail, r.department]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row) {
    setEditingId(pid(row));
    setForm({
      item_name: row.item_name || row.itemName || '',
      vendor: row.vendor || '',
      cost: row.cost ?? '',
      brand: row.brand || '',
      serial_number: row.serial_number || row.serialNumber || '',
      approval_date: (row.approval_date || row.approvalDate || '').toString().slice(0, 10),
      delivery_date: (row.delivery_date || row.deliveryDate || '').toString().slice(0, 10),
      approver: row.approver || '',
      assigned_user_email: row.assigned_user_email || row.assignedUserEmail || '',
      department: row.department || '',
      description: row.description || '',
      status: row.status || 'Delivered / Fulfilled',
    });
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        cost: form.cost === '' ? null : Number(form.cost),
      };
      if (editingId) await procurementApi.update(editingId, body);
      else await procurementApi.create(body);
      showToast('Saved', editingId ? 'Procurement entry updated.' : 'Procurement entry added.', 'success');
      setOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this procurement entry?')) return;
    try {
      await procurementApi.remove(id);
      showToast('Deleted', 'Procurement entry removed.', 'info');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Delete failed', 'error');
    }
  }

  if (!hasPermission('procurement_log')) {
    return (
      <AppShell title="Procurement Log" subtitle="Vendor purchases and deliveries.">
        <AccessDenied moduleName="Procurement Log" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Procurement Log"
      subtitle="Vendor purchase records and asset delivery history."
      actions={canEdit ? (
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <i className="fa-solid fa-plus" /><span>Add Entry</span>
        </button>
      ) : null}
    >
      <div className="table-toolbar">
        <div className="toolbar-left"><h2>Procurement & Delivery Log</h2></div>
        <div className="toolbar-controls-group">
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search item, vendor, email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="helpdesk-table">
          <thead>
            <tr>
              <th>Log ID</th>
              <th>Item</th>
              <th>Vendor</th>
              <th>Cost</th>
              <th>Assigned User</th>
              <th>Delivery Date</th>
              <th>Status</th>
              {canEdit ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={canEdit ? 8 : 7} label="Loading procurement log..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={canEdit ? 8 : 7}><EmptyState text="No procurement records found." /></td></tr>
            ) : (
              pageRows.map((r) => (
                <tr key={pid(r)}>
                  <td><strong>#{pid(r)}</strong></td>
                  <td>{r.item_name || r.itemName}</td>
                  <td>{r.vendor || '—'}</td>
                  <td>{r.cost != null ? `PKR ${r.cost}` : '—'}</td>
                  <td>{r.assigned_user_email || r.assignedUserEmail || '—'}</td>
                  <td>
                    {r.delivery_date || r.deliveryDate
                      ? new Date(r.delivery_date || r.deliveryDate).toLocaleDateString()
                      : '—'}
                  </td>
                  <td><span className={statusBadgeClass(r.status)}>{r.status}</span></td>
                  {canEdit ? (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                        <i className="fa-solid fa-pen" />
                      </button>{' '}
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(pid(r))}>
                        <i className="fa-solid fa-trash" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />

      <Modal
        open={open}
        title={editingId ? 'Edit Procurement Entry' : 'Add Procurement Log Entry'}
        icon="fa-file-invoice-dollar"
        onClose={() => setOpen(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" form="procForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-floppy-disk" /><span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
          </>
        )}
      >
        <form id="procForm" onSubmit={submit} autoComplete="off">
          <div className="form-grid-2">
            <div className="form-group">
              <label>Item Name *</label>
              <input className="form-control" required value={form.item_name} onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Vendor</label>
              <select className="form-control form-control-select" value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}>
                <option value="">Select vendor</option>
                {vendors.map((v) => <option key={v.id || v.name} value={v.name}>{v.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Cost (PKR)</label>
              <input type="number" className="form-control" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Brand</label>
              <input className="form-control" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Serial Number</label>
              <input className="form-control" value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Assigned User Email</label>
              <input type="email" className="form-control" value={form.assigned_user_email} onChange={(e) => setForm((f) => ({ ...f, assigned_user_email: e.target.value }))} />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Approval Date</label>
              <input type="date" className="form-control" value={form.approval_date} onChange={(e) => setForm((f) => ({ ...f, approval_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Delivery Date</label>
              <input type="date" className="form-control" value={form.delivery_date} onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))} />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Approver</label>
              <input className="form-control" value={form.approver} onChange={(e) => setForm((f) => ({ ...f, approver: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Department</label>
              <input className="form-control" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control form-control-select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="Delivered / Fulfilled">Delivered / Fulfilled</option>
              <option value="In Transit">In Transit</option>
              <option value="Ordered">Ordered</option>
            </select>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
