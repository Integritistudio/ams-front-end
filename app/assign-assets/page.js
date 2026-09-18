'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { Pagination, EmptyState } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { assetsApi, usersApi } from '../../services/api';

const PAGE_SIZE = 10;

function pid(a) {
  return a?.public_id || a?.publicId || a?.id;
}

const emptyForm = {
  user_id: '',
  user_email: '',
  asset_code: '',
  category: 'Hardware',
  name: '',
  brand: '',
  serial_number: '',
  assigned_date: new Date().toISOString().slice(0, 10),
  note: '',
};

export default function AssignAssetsPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await assetsApi.list();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load assets', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('assign_assets')) return;
    load();
    usersApi.directory().then((res) => setUsers(res.data || [])).catch(() => {});
  }, [hasPermission, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((a) => {
      if (category !== 'All' && (a.category || '') !== category) return false;
      if (!q) return true;
      return [pid(a), a.asset_code, a.name, a.user_email || a.userEmail, a.brand]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, category]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row) {
    setEditingId(pid(row));
    setForm({
      user_id: row.user_id || row.userId || '',
      user_email: row.user_email || row.userEmail || '',
      asset_code: row.asset_code || row.assetCode || '',
      category: row.category || 'Hardware',
      name: row.name || '',
      brand: row.brand || '',
      serial_number: row.serial_number || row.serialNumber || '',
      assigned_date: (row.assigned_date || row.assignedDate || '').toString().slice(0, 10),
      note: row.note || row.description || '',
    });
    setOpen(true);
  }

  function onUserChange(userId) {
    const u = users.find((x) => String(x.id) === String(userId));
    setForm((f) => ({
      ...f,
      user_id: userId,
      user_email: u?.email || f.user_email,
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        user_id: form.user_id ? Number(form.user_id) : undefined,
      };
      if (editingId) await assetsApi.update(editingId, body);
      else await assetsApi.create(body);
      showToast('Saved', editingId ? 'Asset assignment updated.' : 'Asset assigned.', 'success');
      setOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Remove this asset assignment?')) return;
    try {
      await assetsApi.remove(id);
      showToast('Removed', 'Asset assignment deleted.', 'info');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Delete failed', 'error');
    }
  }

  if (!hasPermission('assign_assets')) {
    return (
      <AppShell title="Assign Assets" subtitle="Assign hardware and licenses to users.">
        <AccessDenied moduleName="Assign Assets" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Assign Assets"
      subtitle="User asset & software access assignment."
      actions={(
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <i className="fa-solid fa-plus" /><span>Assign Asset</span>
        </button>
      )}
    >
      <div className="table-toolbar">
        <div className="toolbar-left"><h2>User Asset & Software Access Assignment</h2></div>
        <div className="toolbar-controls-group">
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search employee, asset code..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="filter-box">
            <select
              className="form-control form-control-select"
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            >
              <option value="All">All Categories</option>
              <option value="Hardware">Hardware</option>
              <option value="Software License">Software License</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="helpdesk-table">
          <thead>
            <tr>
              <th>Record ID</th>
              <th>Employee Name</th>
              <th>Department</th>
              <th>Employee Email</th>
              <th>Asset Code</th>
              <th>Item Name</th>
              <th>Brand / Serial</th>
              <th>Assigned Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={9} label="Loading assignments..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={9}><EmptyState text="No asset assignments found." /></td></tr>
            ) : (
              pageRows.map((a) => {
                const email = a.user_email || a.userEmail;
                const emp = users.find((u) => u.email?.toLowerCase() === email?.toLowerCase());
                return (
                  <tr key={pid(a)}>
                    <td><strong>#{pid(a)}</strong></td>
                    <td>{emp?.name || a.user_name || '—'}</td>
                    <td>{emp?.department || a.department || '—'}</td>
                    <td>{email}</td>
                    <td>{a.asset_code || a.assetCode}</td>
                    <td>{a.name}</td>
                    <td>
                      {a.brand || '—'}
                      <br />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.serial_number || a.serialNumber || ''}</span>
                    </td>
                    <td>
                      {a.assigned_date || a.assignedDate
                        ? new Date(a.assigned_date || a.assignedDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>
                        <i className="fa-solid fa-pen" />
                      </button>{' '}
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(pid(a))}>
                        <i className="fa-solid fa-trash" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />

      <Modal
        open={open}
        title={editingId ? 'Edit Asset Assignment' : 'Assign Asset to User'}
        icon="fa-box-open"
        onClose={() => setOpen(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" form="assignForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-floppy-disk" /><span>{saving ? 'Saving...' : 'Save Assignment'}</span>
            </button>
          </>
        )}
      >
        <form id="assignForm" onSubmit={submit} autoComplete="off">
          <div className="form-group">
            <label>Employee *</label>
            <select
              className="form-control form-control-select"
              required
              value={form.user_id}
              onChange={(e) => onUserChange(e.target.value)}
            >
              <option value="">Select employee</option>
              {users.filter((u) => u.status === 'Active').map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Asset Code *</label>
              <input className="form-control" required value={form.asset_code} onChange={(e) => setForm((f) => ({ ...f, asset_code: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Category *</label>
              <select className="form-control form-control-select" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                <option value="Hardware">Hardware</option>
                <option value="Software License">Software License</option>
              </select>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Item Name *</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Brand</label>
              <input className="form-control" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Serial Number / Software Key *</label>
              <input className="form-control" required value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Assigned Date</label>
              <input type="date" className="form-control" value={form.assigned_date} onChange={(e) => setForm((f) => ({ ...f, assigned_date: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Note</label>
            <textarea className="form-control" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
