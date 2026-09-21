'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usersApi, rolesApi, departmentsApi } from '../../services/api';

const PAGE_SIZE = 10;

const emptyForm = {
  name: '',
  email: '',
  department: '',
  designation: '',
  manager: '',
  phone: '',
  status: 'Active',
  role_id: '',
};

export default function UsersPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [deptFilter, setDeptFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersApi.list();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('users')) return;
    load();
    rolesApi.list().then((res) => setRoles(res.data || [])).catch(() => {});
    departmentsApi.list().then((res) => {
      const list = (res.data || []).map((d) => d.name || d).filter(Boolean);
      setDepartments(list);
    }).catch(() => {});
  }, [hasPermission, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((u) => {
      if (roleFilter !== 'All') {
        const roleName = u.role_name || u.roleName || roles.find((r) => Number(r.id) === Number(u.role_id))?.name;
        if (roleName !== roleFilter && String(u.role_id) !== String(roleFilter)) return false;
      }
      if (deptFilter !== 'All' && (u.department || '') !== deptFilter) return false;
      if (statusFilter !== 'All' && (u.status || '') !== statusFilter) return false;
      if (!q) return true;
      return [u.name, u.email, u.department, u.designation].join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, roleFilter, deptFilter, statusFilter, roles]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, role_id: roles[0]?.id ? String(roles[0].id) : '' });
    setOpen(true);
  }

  function openEdit(u) {
    setEditingId(u.id);
    setForm({
      name: u.name || '',
      email: u.email || '',
      department: u.department || '',
      designation: u.designation || '',
      manager: u.manager || '',
      phone: u.phone || '',
      status: u.status || 'Active',
      role_id: String(u.role_id || u.roleId || ''),
    });
    setOpen(true);
  }

  const managerOptions = useMemo(() => {
    return rows
      .filter((u) => (u.status || '') === 'Active' && Number(u.id) !== Number(editingId))
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [rows, editingId]);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, role_id: Number(form.role_id) };
      if (editingId) await usersApi.update(editingId, body);
      else await usersApi.create(body);
      showToast('Saved', editingId ? 'User updated.' : 'User created.', 'success');
      setOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function sendSetup(id) {
    try {
      await usersApi.sendPasswordSetup(id);
      showToast('Email Sent', 'Password setup link sent to user.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Could not send setup email', 'error');
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this user?')) return;
    try {
      await usersApi.remove(id);
      showToast('Deleted', 'User removed.', 'info');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Delete failed', 'error');
    }
  }

  function clearFilters() {
    setSearch('');
    setRoleFilter('All');
    setDeptFilter('All');
    setStatusFilter('All');
    setPage(1);
  }

  function roleName(u) {
    return u.role_name || u.roleName || roles.find((r) => Number(r.id) === Number(u.role_id || u.roleId))?.name || '—';
  }

  if (!hasPermission('users')) {
    return (
      <AppShell title="User Management" subtitle="Directory and account administration.">
        <AccessDenied moduleName="User Management" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="User Management"
      subtitle="Directory and account administration."
      actions={(
        <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="fa-solid fa-user-plus" /><span>+ Add User</span>
        </button>
      )}
    >
      <div className="table-toolbar">
        <div className="toolbar-left"><h2>User Directory & Directory Management</h2></div>
      </div>

      <div className="table-toolbar" style={{ borderRadius: 0, borderTop: 'none', background: 'rgba(15,23,42,0.15)' }}>
        <div className="toolbar-controls-group" style={{ width: '100%', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search users by name, email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className="form-control form-control-select" style={{ width: 160 }} value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
            <option value="All">All Roles</option>
            {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
          <select className="form-control form-control-select" style={{ width: 180 }} value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}>
            <option value="All">All Departments</option>
            {(departments.length ? departments : [...new Set(rows.map((u) => u.department).filter(Boolean))]).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select className="form-control form-control-select" style={{ width: 130 }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
            <i className="fa-solid fa-filter-circle-xmark" /> Clear
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="helpdesk-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>Username / Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={8} label="Loading users..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={8}><EmptyState text="No users found." /></td></tr>
            ) : (
              pageRows.map((u) => (
                <tr key={u.id}>
                  <td><strong>#{u.id}</strong></td>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{roleName(u)}</td>
                  <td>{u.department || '—'}</td>
                  <td>{u.designation || '—'}</td>
                  <td><span className={statusBadgeClass(u.status)}>{u.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-secondary btn-sm" title="Edit" onClick={() => openEdit(u)}>
                      <i className="fa-solid fa-pen" />
                    </button>{' '}
                    <button type="button" className="btn btn-info btn-sm" title="Send password setup" onClick={() => sendSetup(u.id)}>
                      <i className="fa-solid fa-envelope" />
                    </button>{' '}
                    <button type="button" className="btn btn-danger btn-sm" title="Delete" onClick={() => remove(u.id)}>
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
        title={editingId ? 'Edit User' : 'Add User'}
        icon="fa-user-plus"
        onClose={() => setOpen(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" form="userForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-floppy-disk" /><span>{saving ? 'Saving...' : 'Save User'}</span>
            </button>
          </>
        )}
      >
        <form id="userForm" onSubmit={submit} autoComplete="off">
          <div className="form-grid-2">
            <div className="form-group">
              <label>Full Name *</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Email *</label>
              <input type="email" className="form-control" required disabled={Boolean(editingId)} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Role *</label>
              <select className="form-control form-control-select" required value={form.role_id} onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}>
                <option value="">Select role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control form-control-select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Department</label>
              <select className="form-control form-control-select" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}>
                <option value="">Select department</option>
                {(departments.length ? departments : [
                  'IT & Software Engineering', 'Human Resources', 'Finance', 'Sales', 'Executive Board',
                ]).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Designation</label>
              <input className="form-control" value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Manager</label>
              <select
                className="form-control form-control-select"
                value={form.manager}
                onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))}
              >
                <option value="">Select manager</option>
                {managerOptions.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name} ({u.email})
                  </option>
                ))}
                {form.manager && !managerOptions.some((u) => u.name === form.manager) ? (
                  <option value={form.manager}>{form.manager} (current)</option>
                ) : null}
              </select>
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input className="form-control" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
