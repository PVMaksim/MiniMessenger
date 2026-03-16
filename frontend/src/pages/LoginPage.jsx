import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ username: '', password: '', display_name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = mode === 'login' ? '/auth/login' : '/auth/register';
      const { data } = await api.post(url, form);
      localStorage.setItem('mm_token', data.token);
      localStorage.setItem('mm_user', JSON.stringify(data.user));
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>💬</div>
        <h1 style={s.title}>MiniMessenger</h1>
        <p style={s.subtitle}>Мессенджер для своих</p>

        <div style={s.tabs}>
          <button style={mode === 'login' ? s.tabActive : s.tab} onClick={() => { setMode('login'); setError(''); }}>
            Войти
          </button>
          <button style={mode === 'register' ? s.tabActive : s.tab} onClick={() => { setMode('register'); setError(''); }}>
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>
          <input
            style={s.input}
            type="text"
            placeholder="Логин"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            autoComplete="username"
            required
          />
          {mode === 'register' && (
            <input
              style={s.input}
              type="text"
              placeholder="Отображаемое имя"
              value={form.display_name}
              onChange={e => setForm({ ...form, display_name: e.target.value })}
            />
          )}
          <input
            style={s.input}
            type="password"
            placeholder="Пароль"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            autoComplete="current-password"
            required
          />
          {error && <div style={s.error}>{error}</div>}
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? '...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>
      </div>
    </div>
  );
}

const s = {
  page:     { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f0f2f5' },
  card:     { background: '#fff', borderRadius: 16, padding: '40px 36px', width: 360, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', textAlign: 'center' },
  logo:     { fontSize: 48, marginBottom: 8 },
  title:    { fontSize: 24, fontWeight: 700, margin: '0 0 4px' },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 24 },
  tabs:     { display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e0e0e0', marginBottom: 20 },
  tab:      { flex: 1, padding: '10px 0', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#555' },
  tabActive:{ flex: 1, padding: '10px 0', border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  form:     { display: 'flex', flexDirection: 'column', gap: 12 },
  input:    { padding: '12px 14px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 15, outline: 'none' },
  error:    { background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '10px 12px', fontSize: 13 },
  btn:      { padding: '13px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
};
