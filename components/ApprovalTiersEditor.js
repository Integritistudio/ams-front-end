'use client';

import { useCallback, useEffect, useState } from 'react';
import DataLoader from './DataLoader';
import { EmptyState } from './uiHelpers';
import { useToast } from '../context/ToastContext';
import { approvalTiersApi, rolesApi } from '../services/api';

const SELF_APPROVAL_OPTIONS = [
  { value: 'escalate', label: 'Escalate to next tier' },
  { value: 'manual', label: 'May approve own request' },
  { value: 'auto', label: 'Auto-approve own request' },
];

const EMPTY_NEW = { role_id: '', max_amount: '', self_approval: 'escalate' };

function toDraft(tier) {
  return {
    role_id: String(tier.role_id),
    max_amount: tier.max_amount === null || tier.max_amount === undefined ? '' : String(Number(tier.max_amount)),
    self_approval: tier.self_approval || 'escalate',
    is_active: tier.is_active !== false,
  };
}

function toPayload(draft) {
  return {
    role_id: Number(draft.role_id),
    max_amount: draft.max_amount === '' ? null : Number(draft.max_amount),
    self_approval: draft.self_approval,
    ...(draft.is_active !== undefined ? { is_active: draft.is_active } : {}),
  };
}

/**
 * Super Admin editor for price-approval tiers (which role approves up to which amount).
 * Procurement amounts go directly to the lowest active tier whose limit covers them.
 */
export default function ApprovalTiersEditor() {
  const { showToast } = useToast();
  const [tiers, setTiers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [roles, setRoles] = useState([]);
  const [newTier, setNewTier] = useState(EMPTY_NEW);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, rRes] = await Promise.all([approvalTiersApi.list(), rolesApi.list()]);
      const list = tRes.data || [];
      setTiers(list);
      setDrafts(Object.fromEntries(list.map((t) => [t.id, toDraft(t)])));
      setRoles((rRes.data || []).filter((r) => r.is_active !== false));
    } catch (err) {
      showToast('Error', err.message || 'Failed to load approval tiers', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  function setDraft(id, patch) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function save(id) {
    setBusyId(id);
    try {
      await approvalTiersApi.update(id, toPayload(drafts[id]));
      showToast('Saved', 'Approval tier updated.', 'success');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Could not save approval tier', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(tier) {
    if (!window.confirm(`Remove the ${tier.role_name} approval tier?`)) return;
    setBusyId(tier.id);
    try {
      await approvalTiersApi.remove(tier.id);
      showToast('Removed', 'Approval tier removed.', 'success');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Could not remove approval tier', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (!newTier.role_id) {
      showToast('Required', 'Choose the approver role.', 'warning');
      return;
    }
    setBusyId('new');
    try {
      await approvalTiersApi.create(toPayload({ ...newTier, is_active: undefined }));
      setNewTier(EMPTY_NEW);
      showToast('Added', 'Approval tier added.', 'success');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Could not add approval tier', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const usedRoleIds = new Set(tiers.map((t) => String(t.role_id)));
  const availableRoles = roles.filter((r) => !usedRoleIds.has(String(r.id)));

  return (
    <>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.45 }}>
        After IT submits the initial price, the request goes directly to the lowest active tier whose limit covers
        the amount (leave the limit empty for unlimited). &quot;Own request&quot; decides what happens when the
        requester holds that tier&apos;s role and the amount is within its limit.
      </p>
      {loading ? (
        <DataLoader label="Loading approval tiers..." />
      ) : (
        <>
          <div className="table-container">
            <table className="helpdesk-table">
              <thead>
                <tr>
                  <th>Approver Role</th>
                  <th>Limit (up to)</th>
                  <th>Own request</th>
                  <th>Active</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {tiers.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState text="No approval tiers configured." /></td></tr>
                ) : (
                  tiers.map((t) => {
                    const d = drafts[t.id] || toDraft(t);
                    return (
                      <tr key={t.id}>
                        <td>
                          <select
                            className="form-control form-control-select"
                            value={d.role_id}
                            onChange={(e) => setDraft(t.id, { role_id: e.target.value })}
                          >
                            {roles
                              .filter((r) => String(r.id) === d.role_id || !usedRoleIds.has(String(r.id)))
                              .map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-control"
                            min={1}
                            step="0.01"
                            placeholder="Unlimited"
                            value={d.max_amount}
                            onChange={(e) => setDraft(t.id, { max_amount: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            className="form-control form-control-select"
                            value={d.self_approval}
                            onChange={(e) => setDraft(t.id, { self_approval: e.target.value })}
                          >
                            {SELF_APPROVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={d.is_active}
                            onChange={(e) => setDraft(t.id, { is_active: e.target.checked })}
                          />
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busyId === t.id}
                            onClick={() => save(t.id)}
                            title="Save"
                          >
                            <i className="fa-solid fa-check" />
                          </button>{' '}
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busyId === t.id}
                            onClick={() => remove(t)}
                            title="Remove"
                          >
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

          <form onSubmit={add} autoComplete="off" style={{ marginTop: 16 }}>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Add Approver Role</label>
                <select
                  className="form-control form-control-select"
                  value={newTier.role_id}
                  onChange={(e) => setNewTier((n) => ({ ...n, role_id: e.target.value }))}
                >
                  <option value="">Select role…</option>
                  {availableRoles.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Limit (empty = unlimited)</label>
                <input
                  type="number"
                  className="form-control"
                  min={1}
                  step="0.01"
                  value={newTier.max_amount}
                  onChange={(e) => setNewTier((n) => ({ ...n, max_amount: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Own request</label>
                <select
                  className="form-control form-control-select"
                  value={newTier.self_approval}
                  onChange={(e) => setNewTier((n) => ({ ...n, self_approval: e.target.value }))}
                >
                  {SELF_APPROVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={busyId === 'new'}>
                  <i className="fa-solid fa-plus" /><span>Add Tier</span>
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </>
  );
}
