import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Shield, ArrowRight, UserCog, Bot, Database } from 'lucide-react';
import api from '../api/client';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent, u?: string, p?: string) => {
    e?.preventDefault();
    const loginUser = u || username;
    const loginPass = p || password;
    
    if (!loginUser || !loginPass) {
      setError('Please enter username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/login', {
        username: loginUser,
        password: loginPass,
      });

      localStorage.setItem('user', JSON.stringify({
        user_id: res.data.user_id,
        username: res.data.username,
        role: res.data.role,
        token: res.data.access_token,
      }));

      navigate('/');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const quickLogins = [
    { 
      label: 'Admin', 
      user: 'admin', 
      pass: 'admin123',
      icon: <Shield className="w-4 h-4 text-brand-400" />
    },
    { 
      label: 'Operator', 
      user: 'operator', 
      pass: 'operator123',
      icon: <Database className="w-4 h-4 text-info-400" />
    },
    { 
      label: 'Reviewer', 
      user: 'reviewer', 
      pass: 'reviewer123',
      icon: <Bot className="w-4 h-4 text-warning-400" />
    },
    { 
      label: 'Consumer', 
      user: 'consumer', 
      pass: 'consumer123',
      icon: <UserCog className="w-4 h-4 text-success-400" />
    }
  ];

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background radial gradient (Intain Vault) */}
      <div className="absolute inset-0 pointer-events-none opacity-50"
           style={{ background: 'radial-gradient(circle at 50% 0%, rgba(20, 184, 166, 0.1), transparent 50%)' }} />

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-surface-900 border border-surface-700/50 rounded-2xl flex items-center justify-center mx-auto shadow-2xl mb-6 shadow-brand-500/10">
            <Shield className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-3xl font-bold text-surface-50 tracking-tight">Intain Copilot</h1>
          <p className="text-surface-400 mt-2 text-sm">Enterprise Data Verification & Trust</p>
        </div>

        <div className="glass-card p-8 animate-slide-up shadow-2xl shadow-black/50">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="Enter corporate ID"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-danger-400 text-sm bg-danger-500/10 p-3 rounded-xl border border-danger-500/20 text-center">
                {error}
              </div>
            )}

            <button
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

          <div className="mt-8 pt-8 border-t border-surface-800/60 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-surface-900/90 px-3 text-xs text-surface-500 font-mono">
              Demo Access
            </span>
            
            <div className="grid grid-cols-2 gap-3">
              {quickLogins.map((ql) => (
                <button
                  key={ql.label}
                  onClick={() => handleLogin(undefined, ql.user, ql.pass)}
                  disabled={loading}
                  className="flex items-center gap-2 p-3 bg-surface-800/30 hover:bg-surface-700/50 border border-surface-700/50 rounded-xl transition-all duration-200 group text-left"
                >
                  <div className="p-1.5 bg-surface-900 rounded-lg group-hover:scale-110 transition-transform">
                    {ql.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-surface-200">{ql.label}</div>
                  </div>
                  <ArrowRight className="w-3 h-3 text-surface-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
