import { NavLink, useNavigate } from 'react-router-dom';
import {
  Upload, AlertCircle, Shield, Database,
  LogOut, ChevronRight, Sparkles, FileSearch, Cpu, Lock, History, CheckCircle,
} from 'lucide-react';

interface SidebarProps {
  role: string;
  username: string;
}

export default function Sidebar({ role, username }: SidebarProps) {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const roleLabel: Record<string, string> = {
    ADMIN: 'Master Admin',
    DATA_OPERATOR: 'Data Operator',
    REVIEWER: 'Reviewer',
    DATA_CONSUMER: 'Data Consumer',
  };

  const roleColor: Record<string, string> = {
    ADMIN: 'from-brand-500 to-info-500',
    DATA_OPERATOR: 'from-brand-500 to-blue-500',
    REVIEWER: 'from-purple-500 to-pink-500',
    DATA_CONSUMER: 'from-emerald-500 to-teal-500',
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive
      ? 'bg-brand-600/20 text-brand-400 shadow-sm'
      : 'text-surface-400 hover:text-surface-100 hover:bg-surface-800/60'
    }`;

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 bg-surface-900/80 backdrop-blur-xl border-r border-surface-700/40 flex flex-col z-50">
      {/* Logo */}
      <div className="p-5 border-b border-surface-700/40">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roleColor[role] || roleColor.DATA_OPERATOR} flex items-center justify-center shadow-lg`}>
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold gradient-text">Intain Copilot</h1>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider">Data Verification</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">

        {/* ─── ADMIN: Grouped Sections ─── */}
        {role === 'ADMIN' && (
          <>
            <NavLink to="/" end className={navLinkClass}>
              <Shield className="w-4 h-4" />
              <span className="flex-1">Master Admin</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>

            <div className="px-3 pt-4 pb-1">
              <span className="text-[10px] font-bold text-surface-600 uppercase tracking-widest">Operations</span>
            </div>
            <NavLink to="/upload" className={navLinkClass}>
              <Upload className="w-4 h-4" />
              <span className="flex-1">Ingestion Hub</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
            <NavLink to="/compliance" className={navLinkClass}>
              <Database className="w-4 h-4" />
              <span className="flex-1">Health & Compliance</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>

            <div className="px-3 pt-4 pb-1">
              <span className="text-[10px] font-bold text-surface-600 uppercase tracking-widest">Triage</span>
            </div>
            <NavLink to="/exceptions" className={navLinkClass}>
              <AlertCircle className="w-4 h-4" />
              <span className="flex-1">Triage Queue</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
            <NavLink to="/approved" className={navLinkClass}>
              <CheckCircle className="w-4 h-4" />
              <span className="flex-1">Approved Portfolio</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
            <NavLink to="/audit" className={navLinkClass}>
              <History className="w-4 h-4" />
              <span className="flex-1">Audit Trail</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>

            <div className="px-3 pt-4 pb-1">
              <span className="text-[10px] font-bold text-surface-600 uppercase tracking-widest">Consumer Ledger</span>
            </div>
            <NavLink to="/verified" className={navLinkClass}>
              <Lock className="w-4 h-4" />
              <span className="flex-1">Asset Ledger</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
            <NavLink to="/validation" className={navLinkClass}>
              <Shield className="w-4 h-4" />
              <span className="flex-1">Crypto Validation</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
          </>
        )}

        {/* ─── DATA OPERATOR: Ingestion only ─── */}
        {role === 'DATA_OPERATOR' && (
          <>
            <NavLink to="/" end className={navLinkClass}>
              <Upload className="w-4 h-4" />
              <span className="flex-1">Ingestion Hub</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
            <NavLink to="/compliance" className={navLinkClass}>
              <Database className="w-4 h-4" />
              <span className="flex-1">Health & Compliance</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
          </>
        )}

        {/* ─── REVIEWER: Triage only ─── */}
        {role === 'REVIEWER' && (
          <>
            <NavLink to="/" end className={navLinkClass}>
              <AlertCircle className="w-4 h-4" />
              <span className="flex-1">Triage Queue</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
            <NavLink to="/approved" className={navLinkClass}>
              <CheckCircle className="w-4 h-4" />
              <span className="flex-1">Approved Portfolio</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
            <NavLink to="/audit" className={navLinkClass}>
              <History className="w-4 h-4" />
              <span className="flex-1">Audit Trail</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
          </>
        )}

        {/* ─── DATA CONSUMER: Verified & Audit only ─── */}
        {role === 'DATA_CONSUMER' && (
          <>
            <NavLink to="/" end className={navLinkClass}>
              <Lock className="w-4 h-4" />
              <span className="flex-1">Asset Ledger</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
            <NavLink to="/validation" className={navLinkClass}>
              <Shield className="w-4 h-4" />
              <span className="flex-1">Crypto Validation</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
            <NavLink to="/audit" className={navLinkClass}>
              <History className="w-4 h-4" />
              <span className="flex-1">Audit Trail</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
          </>
        )}

      </nav>

      {/* User */}
      <div className="p-4 border-t border-surface-700/40">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${roleColor[role] || roleColor.DATA_OPERATOR} flex items-center justify-center text-white text-sm font-bold`}>
            {username[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-surface-200 truncate">{username}</div>
            <div className="text-[10px] text-surface-500 uppercase tracking-wider">
              {roleLabel[role] || role}
            </div>
          </div>
        </div>
        <button onClick={logout} className="btn-ghost w-full text-xs text-surface-400 justify-center">
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
