import { useState, useEffect } from 'react';
import { listAuditLogs } from '../../api.js';
import styles from './Admin.module.css';

const EVENT_TYPES = ['QUERY', 'UPLOAD', 'DELETE', 'LOGIN', 'ROLE_CHANGE', 'ACCESS_DENIED'];

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  useEffect(() => {
    loadLogs();
  }, [pagination.page, eventFilter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: 50 };
      if (eventFilter) params.eventType = eventFilter;
      const data = await listAuditLogs(params);
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const eventBadge = (type) => {
    const colorMap = {
      QUERY: styles.badgeManager,
      UPLOAD: styles.badgeReady,
      DELETE: styles.badgeFailed,
      LOGIN: styles.badgeEmployee,
      ROLE_CHANGE: styles.badgeAdmin,
      ACCESS_DENIED: styles.badgeFailed,
    };
    return `${styles.badge} ${colorMap[type] || ''}`;
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Audit Logs</h1>
          <p className={styles.pageSubtitle}>Monitor all system activity and access events</p>
        </div>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}

      <div className={styles.filters}>
        <select
          className={styles.filterSelect}
          value={eventFilter}
          onChange={(e) => { setEventFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          aria-label="Filter by event type"
          id="filter-event-type"
        >
          <option value="">All Events</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className={styles.card}>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table} aria-label="Audit logs table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Event</th>
                <th>Status</th>
                <th>Query</th>
                <th>Latency</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="7"><div className={styles.emptyState}><div className={styles.emptyIcon}>📋</div><p>No audit logs found</p></div></td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className={styles.textMuted} style={{ whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td>{log.user_email || '—'}</td>
                    <td>
                      <span className={eventBadge(log.event_type)}>{log.event_type}</span>
                    </td>
                    <td>
                      {log.answer_status && (
                        <span className={`${styles.badge} ${
                          log.answer_status === 'ANSWERED' ? styles.badgeReady :
                          log.answer_status === 'REFUSED' ? styles.badgePending :
                          styles.badgeFailed
                        }`}>
                          {log.answer_status}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className={styles.truncate} title={log.query_text}>
                        {log.query_text || '—'}
                      </div>
                    </td>
                    <td className={styles.textMuted}>
                      {log.latency_ms ? `${log.latency_ms}ms` : '—'}
                    </td>
                    <td className={styles.textMuted}>
                      {log.ip_address || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              disabled={pagination.page <= 1}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            >
              ← Prev
            </button>
            <span className={styles.pageInfo}>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <button
              className={styles.pageBtn}
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
