'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { EmptyState } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { kbApi } from '../../services/api';

const CATEGORIES = [
  { key: 'All', label: 'All Guides' },
  { key: 'Network', label: 'Network & VPN' },
  { key: 'M365', label: 'Microsoft 365' },
  { key: 'Hardware', label: 'Hardware' },
  { key: 'Security', label: 'Access & Passwords' },
];

function pid(a) {
  return a?.public_id || a?.publicId || a?.id;
}

export default function KnowledgeBasePage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [category, setCategory] = useState('All');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [article, setArticle] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async (cat) => {
    setLoading(true);
    try {
      const res = await kbApi.list(cat);
      setArticles(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load knowledge base', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('knowledge_base')) return;
    load(category);
  }, [hasPermission, category, load]);

  async function openArticle(id) {
    try {
      const res = await kbApi.get(id);
      setArticle(res.data);
      setOpen(true);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load article', 'error');
    }
  }

  if (!hasPermission('knowledge_base')) {
    return (
      <AppShell title="Knowledge Base" subtitle="Self-service help guides.">
        <AccessDenied moduleName="Knowledge Base" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Knowledge Base" subtitle="Self-service solutions before raising a ticket.">
      <div className="kb-hero">
        <h2>Self-Service Help & Knowledge Base</h2>
        <p>Find instant solutions to common network, M365, hardware, and account issues before raising a ticket.</p>
      </div>

      <div className="kb-categories-bar">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`kb-pill ${category === c.key ? 'active' : ''}`}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="kb-grid">
        {loading ? (
          <DataLoader label="Loading articles..." />
        ) : articles.length === 0 ? (
          <EmptyState text="No articles found for this category." />
        ) : (
          articles.map((a) => (
            <div key={pid(a)} className="kb-card" role="button" tabIndex={0} onClick={() => openArticle(pid(a))} onKeyDown={(e) => { if (e.key === 'Enter') openArticle(pid(a)); }}>
              <div className="kb-card-header">
                <div className="kb-card-icon">
                  <i className={`fa-solid ${a.icon || 'fa-book'}`} />
                </div>
                <div className="kb-card-title">{a.title}</div>
              </div>
              <div className="kb-card-desc">{a.summary}</div>
              <div className="kb-card-footer">
                <span className="badge badge-open">{a.category}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Read guide →</span>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={open}
        title={article?.title || 'Article'}
        icon={article?.icon || 'fa-book-open'}
        onClose={() => setOpen(false)}
        maxWidth={720}
        footer={<button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>}
      >
        {article ? (
          <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
            {article.content || article.summary}
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}
