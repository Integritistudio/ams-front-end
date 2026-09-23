'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { rolesApi, modulesApi } from '../../services/api';

const PAGE_SIZE = 10;

const emptyForm = {
  name: '',
  description: '',
  is_active: true,
  is_it_admin: false,
  is_approver: false,
  is_executive: false,
};

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [permissions, setPermissions] = useState([]);
  const [saving, setSaving] = useState(false);

  const [usersOpen, setUsersOpen] = useState(false);
  const [roleUsers, setRoleUsers] = useState([]);
  const [usersTitle, setUsersTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rolesApi.list();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load roles', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('roles')) return;
    load();
  }, [hasPermission, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.description, r.is_active ? 'active' : 'inactive'].join(' ').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPack = useMemo(() => ({
    headers: ['Role ID', 'Name', 'Special', 'Description', 'Users', 'Status'],
    rows: filtered.map((r) => [
      r.id,
      r.name || '',
      [
        r.is_it_admin ? 'IT Admin' : null,
        r.is_approver ? 'Approver' : null,
        r.is_executive ? 'Executive' : null,
      ].filter(Boolean).join(', ') || '—',
      r.description || '',
      r.user_count ?? r.userCount ?? 0,
      r.is_active === false || r.isActive === false ? 'Inactive' : 'Active',
    ]),
  }), [filtered]);

  async function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setPermissions([]);
    setEditOpen(true);
    try {
      const res = await modulesApi.list();
      setPermissions(
        (res.data || []).map((m) => ({
          module_id: m.id,
          slug: m.slug,
          name: m.name,
          icon: m.icon,
          allowed: false,
          can_view_all: false,
        }))
      );
    } catch (_e) {
      /* ignore */
    }
  }

  async function openEdit(role) {
    setEditingId(role.id);
    setForm({
      name: role.name || '',
      description: role.description || '',
      is_active: role.is_active !== false && role.isActive !== false,
      is_it_admin: Boolean(role.is_it_admin),
      is_approver: Boolean(role.is_approver),
      is_executive: Boolean(role.is_executive),
    });
    setEditOpen(true);
    try {
      const res = await rolesApi.permissions(role.id);
      setPermissions(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load permissions', 'error');
      setPermissions([]);
    }
  }

  function togglePerm(moduleId, field) {
    setPermissions((prev) =>
      prev.map((p) => {
        if (Number(p.module_id) !== Number(moduleId)) return p;
        if (field === 'allowed') {
          const allowed = !p.allowed;
          return { ...p, allowed, can_view_all: allowed ? p.can_view_all : false };
        }
        if (field === 'can_view_all') {
          return { ...p, can_view_all: !p.can_view_all, allowed: true };
        }
        return p;
      })
    );
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      let roleId = editingId;
      if (editingId) {
        await rolesApi.update(editingId, form);
      } else {
        const res = await rolesApi.create(form);
        roleId = res.data?.id;
      }
      if (roleId && permissions.length) {
        await rolesApi.setPermissions(
          roleId,
          permissions.map((p) => ({
            module_id: p.module_id,
            allowed: Boolean(p.allowed),
            can_view_all: Boolean(p.can_view_all),
          }))
        );
      }
      showToast('Saved', editingId ? 'Role updated.' : 'Role created.', 'success');
      setEditOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this role? Users must be reassigned first.')) return;
    try {
      await rolesApi.remove(id);
      showToast('Deleted', 'Role removed.', 'info');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Delete failed', 'error');
    }
  }

  async function viewUsers(role) {
    setUsersTitle(role.name);
    setUsersOpen(true);
    try {
      const res = await rolesApi.users(role.id);
      setRoleUsers(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load role users', 'error');
      setRoleUsers([]);
    }
  }

  if (!hasPermission('roles')) {
    return (
      <AppShell title="Role Management" subtitle="Roles and module permissions.">
        <AccessDenied moduleName="Role Management" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Role Management"
      subtitle="Create roles and configure module permissions."
      actions={(
        <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="fa-solid fa-plus" /><span>Add Role</span>
        </button>
      )}
    >
      <div className="table-toolbar">
        <div className="toolbar-left"><h2>Roles & Permissions Matrix</h2></div>
        <div className="toolbar-controls-group">
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search roles..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <TableExportButtons
            filename="roles"
            title="Roles & Permissions"
            headers={exportPack.headers}
            rows={exportPack.rows}
          />
        </div>
      </div>

      <div className="table-container">
        <table className="helpdesk-table">
          <thead>
            <tr>
              <th>Role ID</th>
              <th>Name</th>
              <th>Special</th>
              <th>Description</th>
              <th>Users</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={7} label="Loading roles..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={7}><EmptyState text="No roles found." /></td></tr>
            ) : (
              pageRows.map((r) => (
                <tr key={r.id}>
                  <td><strong>#{r.id}</strong></td>
                  <td>{r.name}</td>
                  <td>
                    {r.is_it_admin ? (
                      <span className="badge badge-info" style={{ marginRight: 4 }}>IT Admin</span>
                    ) : null}
                    {r.is_approver ? (
                      <span className="badge badge-warning" style={{ marginRight: 4 }}>Approver</span>
                    ) : null}
                    {r.is_executive ? (
                      <span className="badge badge-progress">Executive</span>
                    ) : null}
                    {!r.is_it_admin && !r.is_approver && !r.is_executive ? '—' : null}
                  </td>
                  <td>{r.description || '—'}</td>
                  <td>{r.user_count ?? r.userCount ?? 0}</td>
                  <td>
                    <span className={statusBadgeClass(r.is_active === false || r.isActive === false ? 'Inactive' : 'Active')}>
                      {r.is_active === false || r.isActive === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-secondary btn-sm" title="Edit" onClick={() => openEdit(r)}>
                      <i className="fa-solid fa-pen" />
                    </button>{' '}
                    <button type="button" className="btn btn-info btn-sm" title="View users" onClick={() => viewUsers(r)}>
                      <i className="fa-solid fa-users" />
                    </button>{' '}
                    <button type="button" className="btn btn-danger btn-sm" title="Delete" onClick={() => remove(r.id)}>
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
        open={editOpen}
        title={editingId ? 'Edit Role' : 'Create Role'}
        icon="fa-user-shield"
        onClose={() => setEditOpen(false)}
        maxWidth={760}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(false)}>Cancel</button>
            <button type="submit" form="roleForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-floppy-disk" /><span>{saving ? 'Saving...' : 'Save Role'}</span>
            </button>
          </>
        )}
      >
        <form id="roleForm" onSubmit={submit} autoComplete="off">
          <div className="form-grid-2">
            <div className="form-group">
              <label>Role Name *</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
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
            <label>Description</label>
            <textarea className="form-control" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>

          <div
            className="form-group"
            style={{
              background: 'rgba(37,99,235,0.06)',
              border: '1px solid rgba(37,99,235,0.2)',
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <label style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 8, display: 'block' }}>
              Special role designation
            </label>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.45 }}>
              <strong>IT Admin</strong> and <strong>Approver</strong>: one role each, one user each.
              <strong> Executive</strong>: can be enabled on multiple roles and assigned to many users (view all pending approvals, cannot approve).
            </p>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(form.is_it_admin)}
                  onChange={(e) => {
                    const on = e.target.checked;
                    if (on) {
                      const other = rows.find(
                        (r) => r.is_it_admin && Number(r.id) !== Number(editingId)
                      );
                      if (other) {
                        showToast(
                          'Already enabled',
                          `IT Admin is already enabled for role "${other.name}". It can only be enabled for one role.`,
                          'warning'
                        );
                        return;
                      }
                    }
                    setForm((f) => ({
                      ...f,
                      is_it_admin: on,
                      is_approver: on ? false : f.is_approver,
                    }));
                  }}
                />
                <span><strong>IT Admin</strong> — ticket assignee; view all approvals</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(form.is_approver)}
                  onChange={(e) => {
                    const on = e.target.checked;
                    if (on) {
                      const other = rows.find(
                        (r) => r.is_approver && Number(r.id) !== Number(editingId)
                      );
                      if (other) {
                        showToast(
                          'Already enabled',
                          `Approver is already enabled for role "${other.name}". It can only be enabled for one role.`,
                          'warning'
                        );
                        return;
                      }
                    }
                    setForm((f) => ({
                      ...f,
                      is_approver: on,
                      is_it_admin: on ? false : f.is_it_admin,
                    }));
                  }}
                />
                <span><strong>Approver</strong> — approve / reject asset requests</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(form.is_executive)}
                  onChange={(e) => setForm((f) => ({ ...f, is_executive: e.target.checked }))}
                />
                <span><strong>Executive</strong> — view all pending approvals (no approve)</span>
              </label>
            </div>
          </div>

          <div className="account-section-heading" style={{ marginTop: 8 }}>
            <i className="fa-solid fa-lock" /><span>Module Permissions</span>
          </div>
          {permissions.length === 0 ? (
            <EmptyState text="No modules available for permission matrix." />
          ) : (
            <div className="table-container" style={{ maxHeight: 320, overflow: 'auto' }}>
              <table className="helpdesk-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Slug</th>
                    <th style={{ textAlign: 'center' }}>Access</th>
                    <th style={{ textAlign: 'center' }}>View All</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((p) => (
                    <tr key={p.module_id || p.slug}>
                      <td>
                        {p.icon ? <i className={`fa-solid ${p.icon}`} style={{ marginRight: 8 }} /> : null}
                        {p.name}
                      </td>
                      <td><code style={{ fontSize: 12 }}>{p.slug}</code></td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(p.allowed)}
                          onChange={() => togglePerm(p.module_id, 'allowed')}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(p.can_view_all)}
                          disabled={!p.allowed}
                          onChange={() => togglePerm(p.module_id, 'can_view_all')}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={usersOpen}
        title={`Users on role: ${usersTitle}`}
        icon="fa-users"
        onClose={() => setUsersOpen(false)}
        footer={<button type="button" className="btn btn-secondary" onClick={() => setUsersOpen(false)}>Close</button>}
      >
        {roleUsers.length === 0 ? (
          <EmptyState text="No users assigned to this role." />
        ) : (
          <div className="table-container">
            <table className="helpdesk-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {roleUsers.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.department || '—'}</td>
                    <td><span className={statusBadgeClass(u.status)}>{u.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
