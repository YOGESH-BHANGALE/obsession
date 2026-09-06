import { useState } from 'react';
import { authAPI } from '../api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.login(username, password);
      const { access_token, role, user_id, full_name } = res.data;
      localStorage.setItem('token', access_token);
      onLogin({ user_id, full_name, role, username });
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check credentials.');
    }
    setLoading(false);
  };

  const quickLogin = async (user, pass) => {
    setUsername(user);
    setPassword(pass);
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.login(user, pass);
      const { access_token, role, user_id, full_name } = res.data;
      localStorage.setItem('token', access_token);
      onLogin({ user_id, full_name, role, username: user });
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed.');
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-card animate-fade-in">
        <div className="login-icon">🕸️</div>
        <h1 className="login-title">CNAP</h1>
        <p className="login-subtitle">Criminal Network Analysis Platform</p>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
            <div className="alert-text">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button className="btn btn-primary btn-lg" type="submit" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>Quick Login (Demo)</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn btn-accent btn-sm" onClick={() => quickLogin('investigator', 'invest123')}>
              Investigator
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => quickLogin('senior', 'senior123')}>
              Senior Auth
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => quickLogin('admin', 'admin123')}>
              Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
