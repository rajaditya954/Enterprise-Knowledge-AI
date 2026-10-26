import { useState, useEffect, useRef } from 'react';
import {
  listDocuments,
  uploadDocumentFile,
  deleteDocumentApi,
  reindexDocumentApi,
  listDepartments,
} from '../../api.js';
import styles from './Admin.module.css';

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  useEffect(() => {
    loadDepartments();
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [pagination.page, statusFilter, deptFilter]);

  const loadDepartments = async () => {
    try {
      const data = await listDepartments();
      setDepartments(data.departments);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (deptFilter) params.departmentId = deptFilter;
      const data = await listDocuments(params);
      setDocuments(data.documents);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this document and all its chunks?')) return;
    try {
      await deleteDocumentApi(id);
      setSuccess('Document deleted');
      loadDocuments();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReindex = async (id) => {
    try {
      await reindexDocumentApi(id);
      setSuccess('Re-indexing started');
      setTimeout(() => { setSuccess(''); loadDocuments(); }, 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  const statusBadge = (status) => {
    const map = {
      READY: styles.badgeReady,
      PENDING: styles.badgePending,
      PROCESSING: styles.badgeProcessing,
      FAILED: styles.badgeFailed,
    };
    return `${styles.badge} ${map[status] || ''}`;
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Documents</h1>
          <p className={styles.pageSubtitle}>Manage and monitor your knowledge base documents</p>
        </div>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setShowUpload(true)}
          id="upload-btn"
        >
          + Upload Document
        </button>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {success && <div className={styles.success} role="status">{success}</div>}

      {/* Filters */}
      <div className={styles.filters}>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          aria-label="Filter by status"
          id="filter-status"
        >
          <option value="">All Statuses</option>
          <option value="READY">Ready</option>
          <option value="PENDING">Pending</option>
          <option value="PROCESSING">Processing</option>
          <option value="FAILED">Failed</option>
        </select>
        <select
          className={styles.filterSelect}
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          aria-label="Filter by department"
          id="filter-department"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className={styles.card}>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table} aria-label="Documents table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Department</th>
                <th>Level</th>
                <th>Status</th>
                <th>Chunks</th>
                <th>Version</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>
                    Loading...
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>📄</div>
                      <p>No documents found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{doc.title}</div>
                      <div className={styles.textMuted}>{doc.original_filename}</div>
                    </td>
                    <td>{doc.department_name}</td>
                    <td>
                      <span className={styles.badge}>L{doc.permission_level}</span>
                    </td>
                    <td>
                      <span className={statusBadge(doc.status)}>{doc.status}</span>
                    </td>
                    <td>{doc.chunk_count}</td>
                    <td>v{doc.version}</td>
                    <td className={styles.textMuted}>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                          onClick={() => handleReindex(doc.id)}
                          title="Re-index"
                        >
                          🔄
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                          onClick={() => handleDelete(doc.id)}
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
              Page {pagination.page} of {pagination.totalPages}
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

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          departments={departments}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            setShowUpload(false);
            setSuccess('Document uploaded and queued for processing');
            loadDocuments();
            setTimeout(() => setSuccess(''), 3000);
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

function UploadModal({ departments, onClose, onSuccess, onError }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [permissionLevel, setPermissionLevel] = useState('1');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !departmentId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title || file.name);
      formData.append('departmentId', departmentId);
      formData.append('permissionLevel', permissionLevel);
      await uploadDocumentFile(formData);
      onSuccess();
    } catch (err) {
      onError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Upload document">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Upload Document</h2>

        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div
            className={styles.uploadArea}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <div className={styles.uploadIcon}>📁</div>
            <div className={styles.uploadText}>
              {file ? file.name : 'Click to select a file (PDF, DOCX, MD, TXT)'}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.md,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
              id="file-input"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="doc-title">Title</label>
            <input
              id="doc-title"
              className={styles.formInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title (optional)"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="doc-dept">Department</label>
            <select
              id="doc-dept"
              className={styles.formSelect}
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              required
            >
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="doc-perm">Permission Level</label>
            <select
              id="doc-perm"
              className={styles.formSelect}
              value={permissionLevel}
              onChange={(e) => setPermissionLevel(e.target.value)}
            >
              <option value="1">1 — Public</option>
              <option value="2">2 — Internal</option>
              <option value="3">3 — Confidential</option>
              <option value="4">4 — Restricted</option>
            </select>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={uploading || !file || !departmentId}
              id="upload-submit"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
