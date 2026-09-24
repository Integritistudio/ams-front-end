'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { procurementApi, vendorsApi, usersApi, requisitionsApi } from '../../services/api';

const PAGE_SIZE = 10;

const PENDING_REQ_STATUSES = [
  'Approved - Sent to IT',
  'In Progress',
  'In Procurement',
  'On Hold',
];

function pid(r) {
  return r?.public_id || r?.publicId || r?.id;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
  source_req_id: '',
  item_name: '',
  vendor: '',
  cost: '',
  brand: '',
  serial_number: '',
  approval_date: '',
  delivery_date: '',
  approver: '',
  employee_name: '',
  assigned_user_email: '',
  department: '',
  description: '',
  status: 'Delivered / Fulfilled',
};

export default function ProcurementPage() {
  const { hasPermission, role } = useAuth();
  const { showToast } = useToast();
  const canEdit = Boolean(role?.is_it_admin);

  const [rows, setRows] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [pendingReqs, setPendingReqs] = useState([]);
  const [defaultApprover, setDefaultApprover] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const activeVendors = useMemo(
    () => (vendors || []).filter((v) => (v.status || 'Active') === 'Active'),
    [vendors]
  );

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

  const loadPendingReqs = useCallback(async () => {
    try {
      const res = await requisitionsApi.list();
      const list = (res.data || []).filter((r) => PENDING_REQ_STATUSES.includes(r.status));
      setPendingReqs(list);
    } catch {
      setPendingReqs([]);
    }
  }, []);

  useEffect(() => {
    if (!hasPermission('procurement_log')) return;
    load();
    vendorsApi.list().then((res) => setVendors(res.data || [])).catch(() => {});
    usersApi.directory().then((res) => setEmployees(res.data || [])).catch(() => {});
    usersApi.approvers().then((res) => {
      const a = (res.data || [])[0];
      if (a?.name) setDefaultApprover(a.name);
    }).catch(() => {});
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

  const exportPack = useMemo(() => ({
    headers: ['Log ID', 'Item', 'Vendor', 'Cost', 'Brand', 'Serial', 'Assigned User', 'Department', 'Delivery Date', 'Approver', 'Status', 'Description'],
    rows: filtered.map((r) => [
      pid(r),
      r.item_name || r.itemName || '',
      r.vendor || '',
      r.cost ?? '',
      r.brand || '',
      r.serial_number || r.serialNumber || '',
      r.assigned_user_email || r.assignedUserEmail || '',
      r.department || '',
      r.delivery_date || r.deliveryDate
        ? new Date(r.delivery_date || r.deliveryDate).toLocaleDateString()
        : '',
      r.approver || '',
      r.status || '',
      r.description || '',
    ]),
  }), [filtered]);

  function applyEmployeeByName(nameVal) {
    const name = String(nameVal || '').trim().toLowerCase();
    const found = employees.find((u) => String(u.name || '').toLowerCase() === name);
    if (found) {
      setForm((f) => ({
        ...f,
        employee_name: found.name,
        department: found.department || '',
        assigned_user_email: found.email || '',
      }));
    } else {
      setForm((f) => ({
        ...f,
        employee_name: nameVal,
        department: '',
        assigned_user_email: '',
      }));
    }
  }

  function applySourceReq(reqIdOrPublic) {
    if (!reqIdOrPublic) {
      setForm((f) => ({ ...f, source_req_id: '' }));
      return;
    }
    const found = pendingReqs.find(
      (r) => String(r.id) === String(reqIdOrPublic) || String(pid(r)) === String(reqIdOrPublic)
    );
    if (!found) {
      setForm((f) => ({ ...f, source_req_id: reqIdOrPublic }));
      return;
    }
    const email = found.requester_email || found.requesterEmail || '';
    const name = found.requester_name || found.requesterName || '';
    setForm((f) => ({
      ...f,
      source_req_id: String(found.id),
      item_name: found.item || f.item_name,
      employee_name: name,
      assigned_user_email: email,
      department: found.department || '',
      approver: found.approver_name || found.approverName || f.approver || defaultApprover,
      description: found.justification
        ? `Linked to ${pid(found)}: ${found.justification}`
        : `Linked to asset request ${pid(found)}`,
    }));
  }

  async function openCreate() {
    setEditingId(null);
    const today = todayISO();
    await loadPendingReqs();
    setForm({
      ...emptyForm,
      approval_date: today,
      delivery_date: today,
      approver: defaultApprover || '',
      vendor: activeVendors[0]?.name || '',
    });
    setOpen(true);
  }

  function openEdit(row) {
    setEditingId(pid(row));
    const email = row.assigned_user_email || row.assignedUserEmail || '';
    const match = employees.find((u) => String(u.email || '').toLowerCase() === String(email).toLowerCase());
    setForm({
      source_req_id: row.source_req_id || row.sourceReqId || '',
      item_name: row.item_name || row.itemName || '',
      vendor: row.vendor || '',
      cost: row.cost ?? '',
      brand: row.brand || '',
      serial_number: row.serial_number || row.serialNumber || '',
      approval_date: (row.approval_date || row.approvalDate || todayISO()).toString().slice(0, 10),
      delivery_date: (row.delivery_date || row.deliveryDate || todayISO()).toString().slice(0, 10),
      approver: row.approver || defaultApprover || '',
      employee_name: match?.name || email,
      assigned_user_email: email,
      department: row.department || match?.department || '',
      description: row.description || '',
      status: row.status || 'Delivered / Fulfilled',
    });
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.vendor?.trim()) {
      showToast('Required', 'Approved Vendor is required.', 'warning');
      return;
    }
    if (!form.assigned_user_email?.trim()) {
      showToast('Required', 'Select a valid employee from the search list.', 'warning');
      return;
    }
    if (!form.department?.trim()) {
      showToast('Required', 'Department could not be auto-populated. Pick a known employee.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const body = {
        source_req_id: form.source_req_id || null,
        item_name: form.item_name.trim(),
        vendor: form.vendor.trim(),
        cost: form.cost.trim() || null,
        brand: form.brand.trim(),
        serial_number: form.serial_number.trim(),
        approval_date: form.approval_date || todayISO(),
        delivery_date: form.delivery_date || todayISO(),
        approver: form.approver.trim(),
        assigned_user_email: form.assigned_user_email.trim().toLowerCase(),
        department: form.department.trim(),
        description: form.description.trim() || null,
        status: form.status || 'Delivered / Fulfilled',
      };
      if (editingId) await procurementApi.update(editingId, body);
      else await procurementApi.create(body);
      showToast(
        'Saved',
        editingId
          ? 'Procurement entry updated.'
          : form.source_req_id
            ? 'Procurement saved — linked asset request marked Completed.'
            : 'Procurement entry saved & delivery recorded.',
        'success'
      );
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
          <i className="fa-solid fa-plus" /><span>Add Procurement Log</span>
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
              placeholder="Search procurement log..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <TableExportButtons
            filename="procurement-log"
            title="Procurement & Delivery Log"
            headers={exportPack.headers}
            rows={exportPack.rows}
          />
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
                  <td>{r.cost != null && r.cost !== '' ? String(r.cost) : '—'}</td>
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
        title={editingId ? 'Edit Procurement Log Entry' : 'Add Procurement Log Entry'}
        icon="fa-file-invoice-dollar"
        onClose={() => setOpen(false)}
        maxWidth={720}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" form="procForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-floppy-disk" />
              <span>{saving ? 'Saving...' : 'Save Entry & Deliver'}</span>
            </button>
          </>
        )}
      >
        <form id="procForm" onSubmit={submit} autoComplete="off">
          {!editingId ? (
            <div className="form-group">
              <label>Link Pending Asset Request</label>
              <select
                className="form-control form-control-select"
                value={form.source_req_id}
                onChange={(e) => applySourceReq(e.target.value)}
              >
                <option value="">None — ad-hoc procurement (no linked request)</option>
                {pendingReqs.map((r) => (
                  <option key={r.id || pid(r)} value={String(r.id)}>
                    #{pid(r)} — {r.item} ({r.requester_name || r.requesterName}) [{r.status}]
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                {pendingReqs.length === 0
                  ? 'No pending asset requests awaiting IT action.'
                  : 'Selecting a request auto-fills item, employee, and department. Saving marks that request Completed.'}
              </div>
            </div>
          ) : null}

          <div className="form-grid-2">
            <div className="form-group">
              <label>Asset / Item Name *</label>
              <input
                className="form-control"
                required
                value={form.item_name}
                onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Approved Vendor *</label>
              <select
                className="form-control form-control-select"
                required
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
              >
                <option value="">Select vendor</option>
                {activeVendors.map((v) => (
                  <option key={v.id || v.name} value={v.name}>
                    {v.name}{v.category ? ` (${v.category})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Cost / Price *</label>
              <input
                className="form-control"
                required
                placeholder="e.g. 68,000 PKR"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Brand / Model *</label>
              <input
                className="form-control"
                required
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Serial Number / Tag *</label>
              <input
                className="form-control"
                required
                value={form.serial_number}
                onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Approver Name *</label>
              <input
                className="form-control"
                required
                value={form.approver}
                onChange={(e) => setForm((f) => ({ ...f, approver: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Search Employee Name *</label>
              <input
                className="form-control"
                required
                list="procEmployeeSearchList"
                placeholder="Type user name to search..."
                value={form.employee_name}
                onChange={(e) => applyEmployeeByName(e.target.value)}
              />
              <datalist id="procEmployeeSearchList">
                {employees.map((u) => (
                  <option key={u.id || u.email} value={u.name}>
                    {u.email}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="form-group">
              <label>Department (Auto-Populated) *</label>
              <input
                className="form-control"
                required
                readOnly
                value={form.department}
                placeholder="Select employee to auto-fill"
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Approval Date (Auto)</label>
              <input
                type="date"
                className="form-control"
                required
                readOnly
                value={form.approval_date}
              />
            </div>
            <div className="form-group">
              <label>Delivery Date (Auto)</label>
              <input
                type="date"
                className="form-control"
                required
                readOnly
                value={form.delivery_date}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Description / Remarks</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Status *</label>
              <select
                className="form-control form-control-select"
                required
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="Delivered / Fulfilled">Delivered / Fulfilled</option>
                <option value="In Procurement">In Procurement</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
