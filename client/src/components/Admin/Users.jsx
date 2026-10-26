import { useState, useEffect } from 'react';
import { listUsers, createUser, updateUser, listDepartments } from '../../api.js';
import styles from './Admin.module.css';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [userData, deptData] = await Promise.all([listUsers(), listDepartments()]);
      setUsers(userData.users);
      setDepartments(deptData.departments);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await updateUser(user.id, { isActive: !user.is_active });
      setSuccess(`User ${user.is_active ? 'deactivated' : 'activated'}`);
      loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRoleChange = async (user, newRole) => {
    try {
      await updateUser(user.id, { role: newRole });
      setSuccess('Role updated');
      loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const roleBadge = (role) => {
    const map = { ADMIN: styles.badgeAdmin, MANAGER: styles.badgeManager, EMPLOYEE: styles.badgeEmployee };
    return `${styles.badge} ${map[role] || ''}`;
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>User Management</h1>
          <p className={styles.pageSubtitle}>Manage users, roles, and access permissions</p>
        </div>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setShowCreate(true)}
          id="create-user-btn"
        >
          + Create User
        </button>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {success && <div className={styles.success} role="status">{success}</div>}

      <div className={styles.card}>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table} aria-label="Users table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan="6"><div className={styles.emptyState}><div className={styles.emptyIcon}>👥</div><p>No users found</p></div></td></tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 500 }}>{user.email}</td>
                    <td>
                      <select
                        className={styles.filterSelect}
                        value={user.role}
                        onChange={(e) => handleRoleChange(user, e.target.value)}
                        aria-label={`Role for ${user.email}`}
                        style={{ minWidth: 120 }}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MANAGER">Manager</option>
                        <option value="EMPLOYEE">Employee</option>
                      </select>
                    </td>
                    <td>{user.department_name || '—'}</td>
                    <td>
                      <span className={`${styles.badge} ${user.is_active ? styles.badgeReady : styles.badgeFailed}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className={styles.textMuted}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        className={`${styles.btn} ${user.is_active ? styles.btnDanger : styles.btnSecondary} ${styles.btnSmall}`}
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateUserModal
          departments={departments}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            setSuccess('User created');
            loadData();
            setTimeout(() => setSuccess(''), 3000);
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

function CreateUserModal({ departments, onClose, onSuccess, onError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('EMPLOYEE');
  const [departmentId, setDepartmentId] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || !departmentId) return;
    setCreating(true);
    try {
      await createUser({ email, password, role, departmentId });
      onSuccess();
    } catch (err) {
      onError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Create user">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Create User</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="new-email">Email</label>
            <input id="new-email" className={styles.formInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="new-password">Password</label>
            <input id="new-password" className={styles.formInput} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="new-role">Role</label>
            <select id="new-role" className={styles.formSelect} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="new-dept">Department</label>
            <select id="new-dept" className={styles.formSelect} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
              <option value="">Select department</option>
              {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
            </select>
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Cancel</button>
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={creating} id="create-user-submit">
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
