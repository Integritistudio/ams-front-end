'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { assetsApi } from '../../services/api';

const PAGE_SIZE = 10;

function pid(a) {
  return a?.public_id || a?.publicId || a?.id;
}

export default function MyAssetsPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await assetsApi.mine();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load assets', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('my_assets')) return;
    load();
  }, [hasPermission, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((a) => {
      if (category !== 'All' && (a.category || '') !== category) return false;
      if (!q) return true;
      const hay = [pid(a), a.asset_code || a.assetCode, a.name, a.brand, a.serial_number || a.serialNumber]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, category]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPack = useMemo(() => ({
    headers: ['Asset ID', 'Asset Code', 'Category', 'Item Name', 'Brand', 'Serial', 'Assigned Date', 'Note'],
    rows: filtered.map((a) => [
      pid(a),
      a.asset_code || a.assetCode || '',
      a.category || '',
      a.name || '',
      a.brand || '',
      a.serial_number || a.serialNumber || '',
      a.assigned_date || a.assignedDate
        ? new Date(a.assigned_date || a.assignedDate).toLocaleDateString()
        : '',
      a.note || a.description || '',
    ]),
  }), [filtered]);

  if (!hasPermission('my_assets')) {
    return (
      <AppShell title="Assigned Assets" subtitle="Assets assigned to your account.">
        <AccessDenied moduleName="Assigned Assets" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Assigned Assets" subtitle="Physical assets and software licenses on your account.">
      <div className="table-toolbar">
        <div className="toolbar-left"><h2>Assigned Assets & Software Access</h2></div>
        <div className="toolbar-controls-group">
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search asset code, name, serial..."
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
          <TableExportButtons
            filename="assigned-assets"
            title="Assigned Assets"
            headers={exportPack.headers}
            rows={exportPack.rows}
          />
        </div>
      </div>

      <div className="table-container">
        <table className="helpdesk-table">
          <thead>
            <tr>
              <th>Asset ID</th>
              <th>Asset Code</th>
              <th>Category</th>
              <th>Item Name</th>
              <th>Brand / Serial</th>
              <th>Assigned Date</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={7} label="Loading assets..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={7}><EmptyState text="No assets assigned to your account." /></td></tr>
            ) : (
              pageRows.map((a) => (
                <tr key={pid(a)}>
                  <td><strong>#{pid(a)}</strong></td>
                  <td>{a.asset_code || a.assetCode}</td>
                  <td><span className={statusBadgeClass(a.category)}>{a.category}</span></td>
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
                  <td>{a.note || a.description || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
    </AppShell>
  );
}
