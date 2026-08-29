import { Users, Shield, Upload, AlertCircle, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminDash() {
  const navigate = useNavigate();

  const TABS = [
    { id: 'operations', path: '/operator', label: 'Operations', sectionLabel: 'OPERATIONS', icon: <Upload className="w-4 h-4" />, desc: 'Ingestion & Pipeline' },
    { id: 'triage', path: '/reviewer', label: 'Triage', sectionLabel: 'TRIAGE', icon: <AlertCircle className="w-4 h-4" />, desc: 'Exceptions & AI' },
    { id: 'ledger', path: '/consumer', label: 'Consumer Ledger', sectionLabel: 'CONSUMER LEDGER', icon: <Lock className="w-4 h-4" />, desc: 'Verified & Audit' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Admin Header */}
      <div className="glass-card p-6 border-brand-500/30">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-500/10 rounded-xl">
            <Users className="w-6 h-6 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-50 flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-400" />
              Master Admin Control
            </h1>
            <p className="text-surface-400 mt-1 text-sm">Full oversight across all Intain Copilot modules — Operations, Triage, and Consumer Ledger</p>
          </div>
        </div>
      </div>

      {/* Section Jump Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className="glass-card p-6 flex flex-col items-center justify-center gap-3 hover:border-brand-500/50 transition-colors text-center"
          >
            <div className="p-4 bg-surface-800 rounded-full text-brand-400">
              {tab.icon}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">[{tab.sectionLabel}]</div>
              <div className="font-semibold text-surface-100">{tab.label}</div>
              <div className="text-xs text-surface-400 mt-1">{tab.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
