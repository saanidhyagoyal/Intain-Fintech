import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Shield, ArrowRight, UserCog, Bot, Database } from 'lucide-react';
import api from '../api/client';

/**
 * Demo credentials are pulled strictly from environment variables.
 * No credentials are hardcoded in source code.
 * Set VITE_DEMO_*_USER / VITE_DEMO_*_PASS in frontend/.env
 */
const DEMO_CREDENTIALS = [
  {
    label: 'Operator',
    user: import.meta.env.VITE_DEMO_OPERATOR_USER || '',
    pass: import.meta.env.VITE_DEMO_OPERATOR_PASS || '',
    icon: <Database className="w-4 h-4 text-info-400" />,
    desc: 'Upload & ingest CSVs',
  },
  {
    label: 'Reviewer A',
    user: import.meta.env.VITE_DEMO_REVIEWER_A_USER || '',
    pass: import.meta.env.VITE_DEMO_REVIEWER_A_PASS || '',
    icon: <Bot className="w-4 h-4 text-warning-400" />,
    desc: 'Exception triage (A)',
  },
  {
    label: 'Reviewer B',
    user: import.meta.env.VITE_DEMO_REVIEWER_B_USER || '',
    pass: import.meta.env.VITE_DEMO_REVIEWER_B_PASS || '',
    icon: <Shield className="w-4 h-4 text-warning-400" />,
    desc: 'Exception triage (B)',
  },
  {
    label: 'Consumer',
    user: import.meta.env.VITE_DEMO_CONSUMER_USER || '',
    pass: import.meta.env.VITE_DEMO_CONSUMER_PASS || '',
    icon: <UserCog className="w-4 h-4 text-success-400" />,
    desc: 'Verified portfolio & audit',
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const doLogin = async (user: string, pass: string) => {
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/login', {
        username: user,
        password: pass,
      });

      const token = res.data.access_token;

      // Store token in BOTH locations so the interceptor always finds it
      localStorage.setItem('token', token);
      localStorage.setItem(
        'user',
        JSON.stringify({
          user_id: res.data.user_id,
          username: res.data.username,
          role: res.data.role,
          token: token,
        })
      );

      navigate('/');
    } catch {
      setError('Invalid credentials — check username and password');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }
    doLogin(username, password);
  };

  /**
   * 1-Click Quick Login: auto-fills fields AND fires login in one click.
   * Credentials come from import.meta.env.VITE_DEMO_* variables.
   */
  const handleDemoLogin = (user: string, pass: string) => {
    // Update the controlled input state so the form fields reflect the values
    setUsername(user);
    setPassword(pass);
    setError('');
    // Immediately fire the login API call
    doLogin(user, pass);
  };

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(20, 184, 166, 0.1), transparent 50%)',
        }}
      />

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-surface-900 border border-surface-700/50 rounded-2xl flex items-center justify-center mx-auto shadow-2xl mb-6 shadow-brand-500/10">
            <Shield className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-3xl font-bold text-surface-50 tracking-tight">
            Intain Copilot
          </h1>
          <p className="text-surface-400 mt-2 text-sm">
            Enterprise Data Verification & Trust
          </p>
        </div>

        <div className="glass-card p-8 animate-slide-up shadow-2xl shadow-black/50">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="Enter corporate ID"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="text-danger-400 text-sm bg-danger-500/10 p-3 rounded-xl border border-danger-500/20 text-center">
                {error}
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center h-12 shadow-[0_0_15px_rgba(45,212,191,0.2)]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-surface-950/30 border-t-surface-950 rounded-full animate-spin" />
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Secure Login
                </>
              )}
            </button>
          </form>

          {/* ── Demo Access Quick-Login ─────────────────────── */}
          <div className="mt-8 pt-8 border-t border-surface-800/60 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-surface-900/90 px-3 text-xs text-surface-500 font-mono">
              Demo Access
            </span>

            <div className="grid grid-cols-2 gap-3">
              {DEMO_CREDENTIALS.map((ql) => (
                <button
                  key={ql.label}
                  id={`demo-login-${ql.label.toLowerCase()}`}
                  onClick={() => handleDemoLogin(ql.user, ql.pass)}
                  disabled={loading || !ql.user}
                  className="flex items-center gap-2 p-3 bg-surface-800/30 hover:bg-surface-700/50 border border-surface-700/50 rounded-xl transition-all duration-200 group text-left"
                >
                  <div className="p-1.5 bg-surface-900 rounded-lg group-hover:scale-110 transition-transform">
                    {ql.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-surface-200">
                      {ql.label}
                    </div>
                    <div className="text-[10px] text-surface-500 truncate">
                      {ql.desc}
                    </div>
                  </div>
                  <ArrowRight className="w-3 h-3 text-surface-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-surface-600 mt-6 font-mono">
          v2.0 — Event-Sourced Ledger • SHA-256 Hash Chain • AI Copilot
        </p>
      </div>
    </div>
  );
}
