'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { vendorsApi } from '../../services/api';

const PAGE_SIZE = 10;

function pid(v) {
  return v?.public_id || v?.publicId || v?.id;
}

const emptyForm = {
  name: '',
  category: 'Hardware',
  contact: '',
  status: 'Active',
  notes: '',
};

export default function VendorsPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
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
      const res = await vendorsApi.list();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load vendors', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('vendors')) return;
    load();
  }, [hasPermission, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((v) =>
      [pid(v), v.name, v.category, v.contact, v.status].join(' ').toLowerCase().includes(q)
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
      name: row.name || '',
      category: row.category || 'Hardware',
      contact: row.contact || '',
      status: row.status || 'Active',
      notes: row.notes || '',
    });
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) await vendorsApi.update(editingId, form);
      else await vendorsApi.create(form);
      showToast('Saved', editingId ? 'Vendor updated.' : 'Vendor created.', 'success');
      setOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Remove this vendor?')) return;
    try {
      await vendorsApi.remove(id);
      showToast('Removed', 'Vendor deleted.', 'info');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Delete failed', 'error');
    }
  }

  if (!hasPermission('vendors')) {
    return (
      <AppShell title="Approved Vendors" subtitle="Vendor directory management.">
        <AccessDenied moduleName="Vendors" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Approved Vendors"
      subtitle="Manage authorized procurement vendors."
      actions={(
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <i className="fa-solid fa-plus" /><span>Add Vendor</span>
        </button>
      )}
    >
      <div className="table-toolbar">
        <div className="toolbar-left"><h2>Approved Vendor Directory</h2></div>
        <div className="toolbar-controls-group">
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search vendors..."
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
              <th>Vendor ID</th>
              <th>Name</th>
              <th>Category</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={7} label="Loading vendors..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={7}><EmptyState text="No vendors found." /></td></tr>
            ) : (
              pageRows.map((v) => (
                <tr key={pid(v)}>
                  <td><strong>#{pid(v)}</strong></td>
                  <td>{v.name}</td>
                  <td>{v.category}</td>
                  <td>{v.contact || '—'}</td>
                  <td><span className={statusBadgeClass(v.status)}>{v.status}</span></td>
                  <td>{v.notes || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(v)}>
                      <i className="fa-solid fa-pen" />
                    </button>{' '}
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(pid(v))}>
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
        title={editingId ? 'Edit Vendor' : 'Add Vendor'}
        icon="fa-store"
        onClose={() => setOpen(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" form="vendorForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-floppy-disk" /><span>{saving ? 'Saving...' : 'Save Vendor'}</span>
            </button>
          </>
        )}
      >
        <form id="vendorForm" onSubmit={submit} autoComplete="off">
          <div className="form-grid-2">
            <div className="form-group">
              <label>Vendor Name *</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Category *</label>
              <select className="form-control form-control-select" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Services">Services</option>
              </select>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Contact</label>
              <input className="form-control" value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} placeholder="Name / phone / email" />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control form-control-select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
