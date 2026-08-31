import { useState } from 'react';
import { Search, History, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../api/client';
import AuditTimeline from '../components/AuditTimeline';
import type { LoanEvent } from '../types';

export default function AuditTrailDash() {
  const [loanId, setLoanId] = useState("");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<LoanEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hashChainValid, setHashChainValid] = useState(true);

  const [integrityStatus, setIntegrityStatus] = useState<'idle' | 'loading' | 'success' | 'failed'>('idle');
  const [integrityResult, setIntegrityResult] = useState<{ total?: number; error?: string; broken_id?: number }>({});

  const checkLedgerIntegrity = async () => {
    setIntegrityStatus('loading');
    setIntegrityResult({});
    try {
      const res = await api.get('/audit/validate-ledger');
      setIntegrityStatus('success');
      setIntegrityResult({ total: res.data.total_records_checked });
    } catch (err: any) {
      setIntegrityStatus('failed');
      setIntegrityResult({ 
        error: err.response?.data?.detail?.message || 'Ledger validation failed',
        broken_id: err.response?.data?.detail?.broken_at_id
      });
    }
  };

  const searchAuditTrail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanId.trim()) return;
    
    setLoading(true);
    setError(null);
    setEvents([]);
    
    try {
      const res = await api.get(`/audit/loans/${loanId.trim()}`);
      setEvents(res.data.events);
      setHashChainValid(res.data.hash_chain_valid);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to fetch audit trail. Please check the Loan ID.");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-surface-100 flex items-center gap-2">
            <History className="w-6 h-6 text-brand-400" />
            Audit Trail Lifecycle
          </h1>
          <p className="text-surface-400 mt-1">Inspect the immutable compliance history of any loan</p>
        </div>
        <button
          onClick={checkLedgerIntegrity}
          disabled={integrityStatus === 'loading'}
          className="btn-primary shadow-[0_0_15px_rgba(45,212,191,0.2)]"
        >
          <ShieldAlert className="w-4 h-4" />
          {integrityStatus === 'loading' ? 'Validating Ledger...' : 'Run Full Ledger Integrity Check'}
        </button>
      </div>

      {integrityStatus === 'success' && (
        <div className="bg-success-500/10 border border-success-500/20 text-success-400 p-4 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5" />
          Cryptographic chain validated across {integrityResult.total} records.
        </div>
      )}

      {integrityStatus === 'failed' && (
        <div className="bg-danger-500/10 border border-danger-500/20 text-danger-400 p-4 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5" />
          <div>
            <div className="font-bold">COMPLIANCE BREACH DETECTED</div>
            <div>{integrityResult.error}</div>
          </div>
        </div>
      )}

      <div className="glass-card p-6">
        <form onSubmit={searchAuditTrail} className="flex gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              type="text"
              value={loanId}
              onChange={(e) => setLoanId(e.target.value)}
              placeholder="Enter Loan ID..."
              className="w-full bg-surface-900 border border-surface-700 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-500 text-surface-100 placeholder-surface-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !loanId.trim()}
            className="btn-primary"
          >
            {loading ? 'Searching...' : 'Search Ledger'}
          </button>
        </form>

        {error && (
          <div className="bg-danger-500/10 border border-danger-500/20 text-danger-400 p-4 rounded-xl flex items-center gap-3">
            <ShieldAlert className="w-5 h-5" />
            {error}
          </div>
        )}

        {!error && events.length > 0 && (
          <div className="bg-surface-900/50 p-6 rounded-2xl border border-surface-700/50">
            <AuditTimeline events={events} hashChainValid={hashChainValid} />
          </div>
        )}

        {!error && !loading && events.length === 0 && loanId && (
           <div className="text-surface-500 text-center py-12">
             No events found. Enter a valid Loan ID to view its history.
           </div>
        )}
      </div>
    </div>
  );
}
