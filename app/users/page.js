'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usersApi, rolesApi, departmentsApi, uploadsApi } from '../../services/api';
import UserAvatar, { fileToAvatarUploadFile } from '../../components/UserAvatar';

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
  avatar_url: '',
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
  const { hasPermission, user: currentUser } = useAuth();
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
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteRelated, setDeleteRelated] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferPreview, setTransferPreview] = useState(null);
  const [transferFallbackRoleId, setTransferFallbackRoleId] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [pendingSaveBody, setPendingSaveBody] = useState(null);

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

  const fallbackRoles = useMemo(
    () => roles.filter((r) => !r.is_it_admin && !r.is_approver),
    [roles]
  );

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
      avatar_url: u.avatar_url || '',
    });
    setOpen(true);
  }

  async function onAvatarPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    try {
      const prepared = await fileToAvatarUploadFile(file);
      const up = await uploadsApi.upload(prepared);
      const url = up.data?.url || null;
      if (!url) throw new Error('Upload did not return a file URL');
      setForm((f) => ({ ...f, avatar_url: url }));
      showToast('Photo Uploaded', 'Profile photo saved to secure storage. Click Save User to apply.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Could not upload photo', 'error');
    } finally {
      setAvatarUploading(false);
    }
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
      const body = {
        name: form.name,
        email: form.email,
        department: form.department,
        designation: form.designation,
        manager: form.manager,
        phone: form.phone || undefined,
        status: form.status,
        role_id: roleId,
        avatar_url: form.avatar_url || '',
      };
      if (form.password?.trim()) body.password = form.password.trim();

      if (role && (role.is_it_admin || role.is_approver)) {
        try {
          const previewRes = await usersApi.specialRoleTransferPreview({
            role_id: roleId,
            ...(editingId ? { for_user_id: editingId } : {}),
          });
          const preview = previewRes.data;
          if (preview?.required) {
            const defaultFallback =
              fallbackRoles.find((r) => /staff|employee|user|member|general/i.test(r.name || '')) ||
              fallbackRoles[0];
            setTransferPreview(preview);
            setTransferFallbackRoleId(defaultFallback ? String(defaultFallback.id) : '');
            setPendingSaveBody(body);
            setTransferOpen(true);
            setSaving(false);
            return;
          }
        } catch (previewErr) {
          // If preview fails, continue — backend will still enforce transfer rules.
          console.warn('Transfer preview failed', previewErr);
        }
      }

      await saveUser(body);
    } catch (err) {
      if (err?.data?.code === 'SPECIAL_ROLE_TRANSFER_REQUIRED' && err?.data?.data) {
        const preview = err.data.data;
        const defaultFallback =
          fallbackRoles.find((r) => /staff|employee|user|member|general/i.test(r.name || '')) ||
          fallbackRoles[0];
        setTransferPreview(preview);
        setTransferFallbackRoleId(defaultFallback ? String(defaultFallback.id) : '');
        setPendingSaveBody({
          name: form.name,
          email: form.email,
          department: form.department,
          designation: form.designation,
          manager: form.manager,
          phone: form.phone || undefined,
          status: form.status,
          role_id: Number(form.role_id),
          avatar_url: form.avatar_url || '',
          ...(form.password?.trim() ? { password: form.password.trim() } : {}),
        });
        setTransferOpen(true);
      } else {
        showToast('Error', err.message || 'Save failed', 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveUser(body, transferOpts = null) {
    const payload = { ...body };
    if (transferOpts) {
      payload.confirm_special_role_transfer = true;
      if (transferOpts.demote_previous_to_role_id) {
        payload.demote_previous_to_role_id = Number(transferOpts.demote_previous_to_role_id);
      }
    }

    let res;
    if (editingId) res = await usersApi.update(editingId, payload);
    else {
      const createBody = { ...payload, avatar_url: payload.avatar_url || null };
      res = await usersApi.create(createBody);
    }

    const transfer = res?.transfer;
    if (transfer?.transferred) {
      const moved =
        transfer.kind === 'Approver'
          ? `${transfer.reassigned?.requisitions || 0} pending approval(s)`
          : `${transfer.reassigned?.tickets || 0} open ticket(s) and ${transfer.reassigned?.requisitions || 0} IT-queue asset request(s)`;
      showToast(
        `${transfer.kind} transferred`,
        `${transfer.previousHolder?.name} → ${form.name}. Moved: ${moved}. Previous role: ${transfer.demotedToRoleName || 'fallback'}.`,
        'success'
      );
    } else {
      showToast('Saved', editingId ? 'User updated.' : 'User created.', 'success');
    }
    setOpen(false);
    setTransferOpen(false);
    setTransferPreview(null);
    setPendingSaveBody(null);
    await load();
  }

  async function confirmTransfer() {
    if (!pendingSaveBody || !transferPreview) return;
    if (!transferFallbackRoleId) {
      showToast('Required', 'Choose a role for the previous person.', 'warning');
      return;
    }
    setTransferBusy(true);
    try {
      await saveUser(pendingSaveBody, {
        demote_previous_to_role_id: transferFallbackRoleId,
      });
    } catch (err) {
      showToast('Error', err.message || 'Transfer failed', 'error');
    } finally {
      setTransferBusy(false);
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

  async function askDelete(u) {
    if (Number(u.id) === Number(currentUser?.id)) {
      showToast('Not allowed', 'You cannot delete your own account.', 'warning');
      return;
    }
    if ((u.status || '') === 'Deleted') {
      showToast('Already deleted', 'Use Restore to reactivate this user.', 'info');
      return;
    }
    setDeleteBusy(true);
    setDeleteTarget(u);
    setDeleteRelated(null);
    try {
      const res = await usersApi.relatedSummary(u.id);
      setDeleteRelated(res.data?.related || {});
    } catch (err) {
      showToast('Error', err.message || 'Could not load linked records', 'error');
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmSoftDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await usersApi.remove(deleteTarget.id);
      showToast(
        'User soft-deleted',
        `${deleteTarget.name} can no longer sign in. Tickets, requests, and assets stay linked.`,
        'info'
      );
      setDeleteTarget(null);
      setDeleteRelated(null);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Delete failed', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function restoreUser(id) {
    try {
      await usersApi.restore(id);
      showToast('Restored', 'User is Active again and can sign in.', 'success');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Restore failed', 'error');
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
          <select className="form-control form-control-select" style={{ width: 140 }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
            <option value="Deleted">Deleted</option>
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
                  <td><UserAvatar name={u.name} src={u.avatar_url} size="table" /></td>
                  <td>{u.email}</td>
                  <td>{roleName(u)}</td>
                  <td>{u.department || '—'}</td>
                  <td>{u.designation || '—'}</td>
                  <td><span className={statusBadgeClass(u.status)}>{u.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {(u.status || '') === 'Deleted' ? (
                      <button type="button" className="btn btn-success btn-sm" title="Restore user" onClick={() => restoreUser(u.id)}>
                        <i className="fa-solid fa-rotate-left" /><span> Restore</span>
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn btn-secondary btn-sm" title="Edit" onClick={() => openEdit(u)}>
                          <i className="fa-solid fa-pen" />
                        </button>{' '}
                        <button type="button" className="btn btn-info btn-sm" title="Send password setup" onClick={() => sendSetup(u.id)}>
                          <i className="fa-solid fa-envelope" />
                        </button>{' '}
                        <button type="button" className="btn btn-danger btn-sm" title="Soft delete" onClick={() => askDelete(u)}>
                          <i className="fa-solid fa-trash" />
                        </button>
                      </>
                    )}
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
          <div className="form-group user-form-avatar-row">
            <div className="user-form-avatar-preview">
              <UserAvatar name={form.name || 'User'} src={form.avatar_url || null} size="lg" showName={false} />
            </div>
            <div className="user-form-avatar-actions">
              <label style={{ marginBottom: 6, display: 'block' }}>Profile Photo</label>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.45 }}>
                Upload a photo — stored encrypted in the database (same as ticket attachments).
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={avatarUploading || saving}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <i className={`fa-solid ${avatarUploading ? 'fa-spinner fa-spin' : 'fa-camera'}`} />
                  <span>{avatarUploading ? 'Uploading…' : (form.avatar_url ? 'Change Photo' : 'Upload Photo')}</span>
                </button>
                {form.avatar_url ? (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={avatarUploading || saving}
                    onClick={() => setForm((f) => ({ ...f, avatar_url: '' }))}
                  >
                    <i className="fa-solid fa-trash" /><span>Remove</span>
                  </button>
                ) : null}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                hidden
                onChange={onAvatarPick}
              />
            </div>
          </div>

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
                  setForm((f) => ({ ...f, role_id: roleId }));
                  if (role && (role.is_it_admin || role.is_approver)) {
                    const occupied = rows.filter(
                      (u) =>
                        (u.status || '') !== 'Deleted' &&
                        Number(u.role_id || u.roleId) === Number(roleId) &&
                        Number(u.id) !== Number(editingId)
                    );
                    if (occupied.length >= 1) {
                      showToast(
                        'Transfer required',
                        `${role.is_it_admin ? 'IT Admin' : 'Approver'} is currently ${occupied[0].name}. Saving will ask you to confirm moving pending work to this person.`,
                        'info'
                      );
                    }
                  }
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

      <Modal
        open={Boolean(deleteTarget)}
        title="Soft Delete User?"
        icon="fa-triangle-exclamation"
        onClose={() => {
          if (deleteBusy) return;
          setDeleteTarget(null);
          setDeleteRelated(null);
        }}
        maxWidth={520}
        footer={(
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={deleteBusy}
              onClick={() => { setDeleteTarget(null); setDeleteRelated(null); }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={deleteBusy || !deleteRelated}
              onClick={confirmSoftDelete}
            >
              <i className={`fa-solid ${deleteBusy ? 'fa-spinner fa-spin' : 'fa-trash'}`} />
              <span>{deleteBusy ? 'Deleting…' : 'Soft Delete User'}</span>
            </button>
          </>
        )}
      >
        {deleteTarget ? (
          <div>
            <p style={{ marginTop: 0, lineHeight: 1.5 }}>
              You are about to soft-delete <strong>{deleteTarget.name}</strong> ({deleteTarget.email}).
              They will no longer be able to sign in.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Linked tickets, asset requests, assets, and uploads are <strong>not removed</strong> —
              they stay linked to this user so history remains intact. You can restore the account later
              from the Deleted filter.
            </p>
            {!deleteRelated ? (
              <p style={{ marginBottom: 0 }}>
                <i className="fa-solid fa-spinner fa-spin" /> Loading linked records…
              </p>
            ) : (
              <div
                style={{
                  marginTop: 12,
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: 'rgba(220, 38, 38, 0.08)',
                  border: '1px solid rgba(220, 38, 38, 0.25)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Linked records that will remain:</div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Tickets: <strong>{deleteRelated.tickets ?? 0}</strong></li>
                  <li>Asset requests (as requester): <strong>{deleteRelated.requisitions ?? 0}</strong></li>
                  <li>Approvals assigned: <strong>{deleteRelated.approvals_assigned ?? 0}</strong></li>
                  <li>Assigned assets: <strong>{deleteRelated.assets ?? 0}</strong></li>
                  <li>Uploads: <strong>{deleteRelated.uploads ?? 0}</strong></li>
                  <li>Audit log entries: <strong>{deleteRelated.audit_logs ?? 0}</strong></li>
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={transferOpen}
        title={`Transfer ${transferPreview?.kind || 'role'}?`}
        icon="fa-triangle-exclamation"
        onClose={() => {
          if (transferBusy) return;
          setTransferOpen(false);
          setTransferPreview(null);
          setPendingSaveBody(null);
        }}
        maxWidth={540}
        footer={(
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={transferBusy}
              onClick={() => {
                setTransferOpen(false);
                setTransferPreview(null);
                setPendingSaveBody(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={transferBusy || !transferFallbackRoleId}
              onClick={confirmTransfer}
            >
              <i className={`fa-solid ${transferBusy ? 'fa-spinner fa-spin' : 'fa-check'}`} />
              <span>{transferBusy ? 'Transferring…' : 'Confirm & Transfer'}</span>
            </button>
          </>
        )}
      >
        {transferPreview ? (
          <div>
            <p style={{ marginTop: 0, lineHeight: 1.55 }}>
              <strong>{transferPreview.kind}</strong> is currently assigned to{' '}
              <strong>{transferPreview.currentHolder?.name}</strong>
              {transferPreview.currentHolder?.email
                ? ` (${transferPreview.currentHolder.email})`
                : ''}
              .
            </p>
            <div
              style={{
                marginTop: 4,
                marginBottom: 14,
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(217, 119, 6, 0.1)',
                border: '1px solid rgba(217, 119, 6, 0.35)',
                lineHeight: 1.55,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                <i className="fa-solid fa-exclamation-triangle" style={{ marginRight: 6 }} />
                Warning
              </div>
              {transferPreview.kind === 'Approver' ? (
                <p style={{ margin: 0 }}>
                  All <strong>{transferPreview.pending?.requisitions ?? 0}</strong> pending
                  approval(s) will be assigned to <strong>{form.name || 'the new person'}</strong>.
                </p>
              ) : (
                <p style={{ margin: 0 }}>
                  All <strong>{transferPreview.pending?.tickets ?? 0}</strong> open ticket(s)
                  assigned to the current IT Admin, and{' '}
                  <strong>{transferPreview.pending?.requisitions ?? 0}</strong> IT-queue asset
                  request(s), will move to <strong>{form.name || 'the new person'}</strong>.
                </p>
              )}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>New role for {transferPreview.currentHolder?.name || 'previous person'} *</label>
              <select
                className="form-control form-control-select"
                value={transferFallbackRoleId}
                onChange={(e) => setTransferFallbackRoleId(e.target.value)}
              >
                <option value="">Select role</option>
                {fallbackRoles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                They will lose the {transferPreview.kind} designation and keep signing in with this role.
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}
