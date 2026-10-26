import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import styles from './Layout.module.css';

export default function Layout() {
  const { user, logout, isAdminOrManager, isAdmin } = useAuth();

  const getInitials = (email) => {
    return email?.substring(0, 2).toUpperCase() || '??';
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Main navigation">
        <div className={styles.sidebarHeader}>
          <div className={styles.logo} aria-hidden="true">⚡</div>
          <span className={styles.brandName}>EKAI</span>
        </div>

        <nav className={styles.nav}>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
            id="nav-chat"
          >
            <span className={styles.navIcon}>💬</span>
            Chat
          </NavLink>

          {isAdminOrManager && (
            <>
              <div className={styles.navSection}>Administration</div>
              <NavLink
                to="/documents"
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
                id="nav-documents"
              >
                <span className={styles.navIcon}>📄</span>
                Documents
              </NavLink>
              {isAdmin && (
                <NavLink
                  to="/users"
                  className={({ isActive }) =>
                    `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                  }
                  id="nav-users"
                >
                  <span className={styles.navIcon}>👥</span>
                  Users
                </NavLink>
              )}
              <NavLink
                to="/audit"
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
                id="nav-audit"
              >
                <span className={styles.navIcon}>📋</span>
                Audit Logs
              </NavLink>
            </>
          )}
        </nav>

        <div className={styles.userSection}>
          <div className={styles.userCard}>
            <div className={styles.avatar}>{getInitials(user?.email)}</div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user?.email}</div>
              <div className={styles.userRole}>{user?.role}</div>
            </div>
            <button
              className={styles.logoutBtn}
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              id="logout-button"
            >
              ↗
            </button>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
