import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Hash, Activity } from 'lucide-react';
import api from '../api/client';
import AuditTimeline from '../components/AuditTimeline';
import type { LoanDetailResponse, RewindResponse } from '../types';

export default function LoanDetail() {
  const { loanId } = useParams<{ loanId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<LoanDetailResponse | null>(null);
  const [rewindState, setRewindState] = useState<RewindResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get(`/loans/${loanId}`);
        setData(res.data);
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetch();
  }, [loanId]);

  const handleRewind = async (timestamp: string) => {
    try {
      const res = await api.post('/audit/rewind', { loan_id: loanId, target_timestamp: timestamp });
      setRewindState(res.data);
    } catch { /* ignore */ }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      await api.post(`/loans/${loanId}/verify`);
      // Refresh data
      const res = await api.get(`/loans/${loanId}`);
      setData(res.data);
    } catch { /* ignore */ }
    setVerifying(false);
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  const loan = data.loan;
  const displayState = rewindState?.projected_state || loan;

  const fields = [
    { label: 'Loan ID', key: 'loan_id' },
    { label: 'Borrower ID', key: 'borrower_id' },
    { label: 'Loan Type', key: 'loan_type' },
    { label: 'Origination Date', key: 'origination_date' },
    { label: 'Maturity Date', key: 'maturity_date' },
    { label: 'Original Principal', key: 'original_principal', format: 'currency' },
    { label: 'Current Balance', key: 'current_balance', format: 'currency' },
    { label: 'Interest Rate', key: 'interest_rate', format: 'rate' },
    { label: 'Term (Months)', key: 'term_months' },
    { label: 'Borrower State', key: 'borrower_state' },
    { label: 'Loan Purpose', key: 'loan_purpose' },
    { label: 'Credit Grade', key: 'credit_grade' },
    { label: 'Employment Length', key: 'employment_length' },
    { label: 'Income Band', key: 'income_band' },
    { label: 'Payment Status', key: 'payment_status' },
    { label: 'Days Past Due', key: 'days_past_due' },
    { label: 'Servicer', key: 'servicer_name' },
    { label: 'Last Payment', key: 'last_payment_date' },
    { label: 'Last Updated', key: 'last_updated_at' },
    { label: 'Document Status', key: 'document_status' },
    { label: 'Source System', key: 'source_system' },
  ];

  const formatValue = (val: unknown, format?: string) => {
    if (val == null || val === '') return '—';
    if (format === 'currency') return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
    if (format === 'rate') return `${Number(val).toFixed(2)}%`;
    return String(val);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-surface-100 flex items-center gap-3">
              Loan {loanId}
              {loan.is_verified && <span className="badge-verified text-xs">✓ Verified</span>}
              {loan.has_exceptions && <span className="badge-open text-xs">⚠ Exceptions</span>}
            </h1>
            <p className="text-surface-400 text-sm mt-1">
              {loan.event_count} events • Last: {loan.last_event_type}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {!loan.is_verified && (
            <button onClick={handleVerify} disabled={verifying} className="btn-success text-sm">
              <Shield className="w-4 h-4" />
              {verifying ? 'Verifying...' : 'Verify Loan'}
            </button>
          )}
        </div>
      </div>

      {/* Rewind Banner */}
      {rewindState && (
        <div className="glass-card p-4 border-brand-500/30 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-brand-400">
              <Activity className="w-4 h-4" />
              <span className="text-sm font-medium">
                Time Travel: Showing state at {new Date(rewindState.target_timestamp).toLocaleString()}
              </span>
              <span className="text-xs text-surface-500">
                ({rewindState.events_replayed} events replayed, {rewindState.events_skipped} skipped)
              </span>
            </div>
            <button onClick={() => setRewindState(null)} className="btn-ghost text-xs">
              Reset to Current
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-surface-500">
            <Hash className="w-3 h-3" />
            State Hash: <span className="font-mono">{rewindState.state_hash.slice(0, 24)}...</span>
          </div>
        </div>
      )}

      {/* Loan Fields Grid */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-surface-100 mb-4">Loan Record (21 Fields)</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {fields.map((f) => {
            const val = (displayState as Record<string, unknown>)[f.key];
            return (
              <div key={f.key} className="bg-surface-800/40 rounded-xl p-3">
                <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">{f.label}</div>
                <div className="text-sm font-medium text-surface-200 truncate">
                  {formatValue(val, f.format)}
                </div>
              </div>
            );
          })}
        </div>

        {loan.record_hash && (
          <div className="mt-4 flex items-center gap-2 text-xs text-surface-500 bg-surface-800/40 rounded-xl p-3">
            <Hash className="w-3.5 h-3.5" />
            Record Hash: <span className="font-mono text-brand-400">{loan.record_hash}</span>
          </div>
        )}
      </div>

      {/* Audit Timeline */}
      <div className="glass-card p-6">
        <AuditTimeline
          events={data.events}
          hashChainValid={true}
          onRewind={handleRewind}
        />
      </div>
    </div>
  );
}
