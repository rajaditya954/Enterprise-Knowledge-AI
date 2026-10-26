import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import styles from './Login.module.css';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoSection}>
          <div className={styles.logoIcon} aria-hidden="true">⚡</div>
          <h1 className={styles.title}>Enterprise Knowledge AI</h1>
          <p className={styles.subtitle}>Sign in to access your knowledge base</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} aria-label="Login form">
          {error && (
            <div className={styles.error} role="alert" id="login-error">
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
              autoFocus
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            id="login-submit"
            className={styles.button}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className={styles.demoHint}>
          Demo: <code>admin@company.com</code> / <code>Password123!</code>
        </div>
      </div>
    </div>
  );
}
