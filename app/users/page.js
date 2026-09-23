'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
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
  password: '',
};

function generatePassword(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$!';
  let pass = '';
  for (let i = 0; i < length; i += 1) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

const QUICK_ADD_META = {
  department: {
    title: 'Add New Department',
    icon: 'fa-building',
    label: 'Department Name *',
  },
  designation: {
    title: 'Add New Designation',
    icon: 'fa-briefcase',
    label: 'Designation Title *',
  },
  manager: {
    title: 'Add New Line Manager',
    icon: 'fa-user-tie',
    label: 'Manager Name *',
  },
};

export default function UsersPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
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

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickType, setQuickType] = useState(null);
  const [quickValue, setQuickValue] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersApi.list();
      const list = res.data || [];
      setRows(list);
      const fromUsers = [...new Set(list.map((u) => u.designation).filter(Boolean))].sort();
      setDesignations((prev) => [...new Set([...prev, ...fromUsers])].sort());
    } catch (err) {
      showToast('Error', err.message || 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadDepartments = useCallback(async () => {
    try {
      const res = await departmentsApi.list();
      const list = (res.data || []).map((d) => d.name || d).filter(Boolean);
      setDepartments(list);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hasPermission('users')) return;
    load();
    rolesApi.list().then((res) => setRoles(res.data || [])).catch(() => {});
    loadDepartments();
  }, [hasPermission, load, loadDepartments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((u) => {
      if (roleFilter !== 'All') {
        const roleNameVal = u.role_name || u.roleName || roles.find((r) => Number(r.id) === Number(u.role_id))?.name;
        if (roleNameVal !== roleFilter && String(u.role_id) !== String(roleFilter)) return false;
      }
      if (deptFilter !== 'All' && (u.department || '') !== deptFilter) return false;
      if (statusFilter !== 'All' && (u.status || '') !== statusFilter) return false;
      if (!q) return true;
      return [u.name, u.email, u.department, u.designation].join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, roleFilter, deptFilter, statusFilter, roles]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPack = useMemo(() => ({
    headers: ['User ID', 'Name', 'Email', 'Role', 'Department', 'Designation', 'Manager', 'Phone', 'Status'],
    rows: filtered.map((u) => [
      u.id,
      u.name || '',
      u.email || '',
      u.role_name || u.roleName || roles.find((r) => Number(r.id) === Number(u.role_id))?.name || '',
      u.department || '',
      u.designation || '',
      u.manager || '',
      u.phone || '',
      u.status || '',
    ]),
  }), [filtered, roles]);

  const deptOptions = useMemo(() => {
    const fallback = [
      'IT & Software Engineering',
      'Human Resources',
      'Finance',
      'Sales',
      'Executive Board',
    ];
    return [...new Set([...(departments.length ? departments : fallback), form.department].filter(Boolean))].sort();
  }, [departments, form.department]);

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      role_id: roles[0]?.id ? String(roles[0].id) : '',
      manager: '',
    });
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
      password: '',
    });
    setOpen(true);
  }

  function openQuickAdd(type) {
    setQuickType(type);
    setQuickValue('');
    setQuickOpen(true);
  }

  async function saveQuickAdd() {
    const val = quickValue.trim();
    if (!val || !quickType) {
      showToast('Required', 'Please enter a value.', 'warning');
      return;
    }
    setQuickSaving(true);
    try {
      if (quickType === 'department') {
        try {
          await departmentsApi.create(val);
        } catch (err) {
          if (!(err.message || '').toLowerCase().includes('already')) throw err;
        }
        await loadDepartments();
        setForm((f) => ({ ...f, department: val }));
        showToast('Department Added', `New department "${val}" added and selected.`, 'success');
      } else if (quickType === 'designation') {
        setDesignations((prev) => [...new Set([...prev, val])].sort());
        setForm((f) => ({ ...f, designation: val }));
        showToast('Designation Added', `Designation set to "${val}".`, 'success');
      } else if (quickType === 'manager') {
        setForm((f) => ({ ...f, manager: val }));
        showToast('Line Manager Added', `Line Manager set to "${val}".`, 'success');
      }
      setQuickOpen(false);
      setQuickType(null);
      setQuickValue('');
    } catch (err) {
      showToast('Error', err.message || 'Could not add entry', 'error');
    } finally {
      setQuickSaving(false);
    }
  }

  function autoGeneratePassword() {
    const pass = generatePassword(10);
    setForm((f) => ({ ...f, password: pass }));
    showToast('Password Generated', `New secure password generated: ${pass}`, 'success');
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.department?.trim()) {
      showToast('Required', 'Department is required.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const roleId = Number(form.role_id);
      const role = roles.find((r) => Number(r.id) === roleId);
      if (role && (role.is_it_admin || role.is_approver)) {
        const kind = role.is_it_admin ? 'IT Admin' : 'Approver';
        const occupied = rows.filter(
          (u) => Number(u.role_id || u.roleId) === roleId && Number(u.id) !== Number(editingId)
        );
        if (occupied.length >= 1) {
          showToast(
            'Not allowed',
            `${kind} role can only be assigned to one person (currently: ${occupied[0].name}). Change that user's role first.`,
            'warning'
          );
          setSaving(false);
          return;
        }
      }
      const body = {
        name: form.name,
        email: form.email,
        department: form.department,
        designation: form.designation,
        manager: form.manager,
        phone: form.phone || undefined,
        status: form.status,
        role_id: roleId,
      };
      if (form.password?.trim()) body.password = form.password.trim();
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
      const res = await usersApi.sendPasswordSetup(id);
      if (res.data?.delivered === false || res.data?.logged) {
        showToast(
          'SMTP not configured',
          res.message || 'No email was sent. Check the backend console for the password setup link.',
          'warning'
        );
      } else {
        showToast('Email Sent', res.message || 'Password setup link sent to user.', 'success');
      }
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

  const labelRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  };

  if (!hasPermission('users')) {
    return (
      <AppShell title="User Management" subtitle="Directory and account administration.">
        <AccessDenied moduleName="User Management" />
      </AppShell>
    );
  }

  const quickMeta = quickType ? QUICK_ADD_META[quickType] : null;

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
          <TableExportButtons
            filename="users"
            title="User Directory"
            headers={exportPack.headers}
            rows={exportPack.rows}
          />
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
        title={editingId ? 'Edit Corporate User' : 'Add New Corporate User'}
        icon="fa-user"
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
              <input
                className="form-control"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Official Email *</label>
              <input
                type="email"
                className="form-control"
                placeholder="name@integriti.io"
                required
                disabled={Boolean(editingId)}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <div style={labelRowStyle}>
                <label style={{ marginBottom: 0 }}>Department *</label>
                <button
                  type="button"
                  className="btn-ai btn-sm"
                  style={{ height: 22, fontSize: 10.5, padding: '0 6px' }}
                  onClick={() => openQuickAdd('department')}
                >
                  <i className="fa-solid fa-plus" /> Add New
                </button>
              </div>
              <select
                className="form-control form-control-select"
                required
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              >
                <option value="">Select department</option>
                {deptOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Role *</label>
              <select
                className="form-control form-control-select"
                required
                value={form.role_id}
                onChange={(e) => {
                  const roleId = e.target.value;
                  const role = roles.find((r) => String(r.id) === String(roleId));
                  if (role && (role.is_it_admin || role.is_approver)) {
                    const occupied = rows.filter(
                      (u) =>
                        Number(u.role_id || u.roleId) === Number(roleId) &&
                        Number(u.id) !== Number(editingId)
                    );
                    if (occupied.length >= 1) {
                      showToast(
                        'Not allowed',
                        `This role can only be assigned to one person (currently: ${occupied[0].name}).`,
                        'warning'
                      );
                      return;
                    }
                  }
                  setForm((f) => ({ ...f, role_id: roleId }));
                }}
              >
                <option value="">Select role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <div style={labelRowStyle}>
                <label style={{ marginBottom: 0 }}>Designation *</label>
                <button
                  type="button"
                  className="btn-ai btn-sm"
                  style={{ height: 22, fontSize: 10.5, padding: '0 6px' }}
                  onClick={() => openQuickAdd('designation')}
                >
                  <i className="fa-solid fa-plus" /> Add New
                </button>
              </div>
              <input
                className="form-control"
                list="userDesignationList"
                placeholder="e.g. Technical Support Specialist"
                required
                value={form.designation}
                onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
              />
              <datalist id="userDesignationList">
                {designations.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                className="form-control form-control-select"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <div style={labelRowStyle}>
                <label style={{ marginBottom: 0 }}>Line Manager</label>
                <button
                  type="button"
                  className="btn-ai btn-sm"
                  style={{ height: 22, fontSize: 10.5, padding: '0 6px' }}
                  onClick={() => openQuickAdd('manager')}
                >
                  <i className="fa-solid fa-plus" /> Add New
                </button>
              </div>
              <input
                className="form-control"
                list="userManagerList"
                placeholder="e.g. Ahmer Arsalan"
                value={form.manager}
                onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))}
              />
              <datalist id="userManagerList">
                {rows
                  .filter((u) => (u.status || '') === 'Active' && Number(u.id) !== Number(editingId))
                  .map((u) => (
                    <option key={u.id} value={u.name}>{u.email}</option>
                  ))}
              </datalist>
            </div>
            <div className="form-group">
              <div style={labelRowStyle}>
                <label style={{ marginBottom: 0 }}>Password (New / Reset)</label>
                <button
                  type="button"
                  className="btn-ai btn-sm"
                  style={{ height: 22, fontSize: 10.5, padding: '0 6px' }}
                  onClick={autoGeneratePassword}
                >
                  <i className="fa-solid fa-key" /> Auto-Generate
                </button>
              </div>
              <input
                type="text"
                className="form-control"
                placeholder="Leave blank to email password-setup link"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
              />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={quickOpen}
        title={quickMeta?.title || 'Add New Entry'}
        icon={quickMeta?.icon || 'fa-plus'}
        onClose={() => { setQuickOpen(false); setQuickType(null); }}
        maxWidth={420}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setQuickOpen(false); setQuickType(null); }}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={quickSaving} onClick={saveQuickAdd}>
              <i className="fa-solid fa-check" /><span>{quickSaving ? 'Saving...' : 'Save'}</span>
            </button>
          </>
        )}
      >
        <div className="form-group">
          <label>{quickMeta?.label || 'Name / Title *'}</label>
          <input
            className="form-control"
            placeholder="Type here..."
            value={quickValue}
            autoFocus
            onChange={(e) => setQuickValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                saveQuickAdd();
              }
            }}
          />
        </div>
      </Modal>
    </AppShell>
  );
}
