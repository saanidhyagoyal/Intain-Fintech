import { useState } from 'react';
import { Users, Shield, Upload, AlertCircle, Lock } from 'lucide-react';
import OperatorDash from './OperatorDash';
import ReviewerDash from './ReviewerDash';
import ConsumerDash from './ConsumerDash';

export default function AdminDash() {
  const [activeTab, setActiveTab] = useState<'operations' | 'triage' | 'ledger'>('operations');

  const TABS = [
    { id: 'operations', label: 'Operations', sectionLabel: 'OPERATIONS', icon: <Upload className="w-4 h-4" />, desc: 'Ingestion & Pipeline' },
    { id: 'triage', label: 'Triage', sectionLabel: 'TRIAGE', icon: <AlertCircle className="w-4 h-4" />, desc: 'Exceptions & AI' },
    { id: 'ledger', label: 'Consumer Ledger', sectionLabel: 'CONSUMER LEDGER', icon: <Lock className="w-4 h-4" />, desc: 'Verified & Audit' },
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

      {/* Section Tabs */}
      <div className="flex space-x-2 bg-surface-900/60 p-1.5 rounded-xl border border-surface-700/50 w-full">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-surface-800 text-brand-400 shadow-sm border border-surface-700/50'
                : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'
            }`}
          >
            {tab.icon}
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-wider text-surface-500">[{tab.sectionLabel}]</div>
              <div>{tab.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="pt-2 animate-fade-in">
        {activeTab === 'operations' && <OperatorDash />}
        {activeTab === 'triage' && <ReviewerDash />}
        {activeTab === 'ledger' && <ConsumerDash />}
      </div>
    </div>
  );
}
