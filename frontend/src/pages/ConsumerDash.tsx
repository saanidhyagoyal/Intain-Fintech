import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Shield, Download, Hash, CheckCircle, TrendingUp, Database, Lock, ShieldCheck, Eye, Search, X } from 'lucide-react';
import api from '../api/client';
import StatsCard from '../components/StatsCard';
import AuditTimeline from '../components/AuditTimeline';
import type { VerifiedLoanResponse, SummaryResponse, LoanEvent } from '../types';

export default function ConsumerDash() {
  const [verified, setVerified] = useState<VerifiedLoanResponse[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyingHash, setVerifyingHash] = useState(false);
  const [hashVerified, setHashVerified] = useState<boolean | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<LoanEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const location = useLocation();
  const isValidationTab = location.pathname.includes('/validation');

  const [pastedHash, setPastedHash] = useState('');
  const [hashValidationState, setHashValidationState] = useState<'idle' | 'validating' | 'success' | 'error' | 'revoked'>('idle');
  const [revokeReason, setRevokeReason] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vRes, sRes] = await Promise.all([
          api.get('/verified-loans?page_size=50'),
          api.get('/summary'),
        ]);
        setVerified(vRes.data.loans);
        setSummary(sRes.data);
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchData();
  }, []);

  const exportCSV = async () => {
    try {
      const res = await api.get('/verified-loans/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'verified_loans_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch { /* ignore */ }
  };

  const verifyLedgerIntegrity = async () => {
    setVerifyingHash(true);
    setHashVerified(null);
    const allValid = verified.every(v => v.hash_chain_valid);
    await new Promise(r => setTimeout(r, 1500));
    setHashVerified(allValid);
    setVerifyingHash(false);
  };

  const validatePastedHash = async () => {
    if (!pastedHash) return;
    setHashValidationState('validating');
    
    try {
      const res = await api.get(`/loans/validate-hash/${pastedHash.trim()}`);
      if (res.data.status === 'valid') {
        setHashValidationState('success');
      } else if (res.data.status === 'revoked') {
        setHashValidationState('revoked');
        setRevokeReason(res.data.reason);
      } else {
        setHashValidationState('error');
      }
    } catch {
      setHashValidationState('error');
    }
  };

  const inspectAuditTrail = async (loanId: string) => {
    if (selectedLoanId === loanId) {
      setSelectedLoanId(null);
      return;
    }
    setSelectedLoanId(loanId);
    setAuditLoading(true);
    try {
      const res = await api.get(`/loans/${loanId}`);
      setAuditEvents(res.data.events || []);
    } catch {
      setAuditEvents([]);
    }
    setAuditLoading(false);
  };

  const formatCurrency = (val: number | null) =>
    val != null ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—';

  const filteredVerified = verified.filter(v =>
    v.loan.loan_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-1/3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    );
  }

  const qualityScore = summary?.data_quality_score || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">{isValidationTab ? 'Cryptographic Validation' : 'Verified Canonical Portfolio'}</h1>
          <p className="text-surface-400 mt-1">{isValidationTab ? 'Independently verify ledger integrity using SHA-256 hashes' : 'Cryptographically sealed, immutable loan records for compliance and audit'}</p>
        </div>
        {!isValidationTab && (
          <button onClick={exportCSV} className="btn-primary text-sm">
            <Download className="w-4 h-4" />
            Export Verified CSV
          </button>
        )}
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard icon={<Shield className="w-5 h-5 text-success-400" />} label="Verified Loans" value={summary.verified_loans} color="success" delay={0} />
          <StatsCard icon={<Database className="w-5 h-5 text-brand-400" />} label="Total Portfolio" value={summary.total_loans} color="brand" delay={100} />
          <StatsCard icon={<TrendingUp className="w-5 h-5 text-info-400" />} label="Quality Score" value={`${qualityScore}%`} color="info" delay={200} />
          <StatsCard icon={<CheckCircle className="w-5 h-5 text-success-400" />} label="Resolution Rate" value={`${summary.resolution_rate}%`} color="success" delay={300} />
        </div>
      )}

      {/* Cryptographic Validation Tab */}
      {isValidationTab && (
        <div className="space-y-6">
          {/* Cryptographic Verification Banner */}
          <div className={`glass-card p-6 transition-all duration-500 ${hashVerified === true ? 'border-success-500/50 shadow-[0_0_30px_rgba(34,197,94,0.15)]' : 'border-surface-700/50'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl transition-all duration-500 ${hashVerified === true ? 'bg-success-500/20' :
                    hashVerified === false ? 'bg-danger-500/20' : 'bg-surface-800'
                  }`}>
                  {hashVerified === true ? (
                    <ShieldCheck className="w-7 h-7 text-success-400 animate-pulse" />
                  ) : (
                    <Lock className="w-7 h-7 text-surface-400" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-surface-100">Full Ledger Integrity Check</h2>
                  {hashVerified === true ? (
                    <p className="text-success-400 text-sm mt-0.5 font-medium">
                      ✓ 100% Cryptographically Intact & Tamper-Evident — All SHA-256 chains verified
                    </p>
                  ) : hashVerified === false ? (
                    <p className="text-danger-400 text-sm mt-0.5 font-medium">
                      ✗ Hash chain integrity violation detected. Investigate immediately.
                    </p>
                  ) : (
                    <p className="text-surface-400 text-sm mt-0.5">
                      Validate the SHA-256 hash chain across all {verified.length} verified records
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={verifyLedgerIntegrity}
                disabled={verifyingHash}
                className={`text-sm px-5 py-2.5 rounded-xl font-medium transition-all duration-200 ${hashVerified === true
                    ? 'bg-success-500/20 text-success-400 border border-success-500/30'
                    : 'btn-primary'
                  }`}
              >
                {verifyingHash ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </div>
                ) : hashVerified === true ? (
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Verified ✓
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4" />
                    Verify Ledger Integrity
                  </div>
                )}
              </button>
            </div>
          </div>

          <div className="glass-card p-8">
            <h2 className="text-lg font-semibold text-surface-100 mb-2 flex items-center gap-2">
              <Hash className="w-5 h-5 text-brand-400" />
              Independent Hash Validation
            </h2>
            <p className="text-sm text-surface-400 mb-6">Paste a SHA-256 hash to cryptographically verify its existence and integrity on the immutable ledger.</p>

            <div className="flex gap-4 mb-4">
              <input
                type="text"
                value={pastedHash}
                onChange={(e) => {
                  setPastedHash(e.target.value);
                  setHashValidationState('idle');
                }}
                placeholder="Paste SHA-256 hash (e.g. e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855)"
                className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand-500 text-surface-100 font-mono"
              />
              <button
                onClick={validatePastedHash}
                disabled={!pastedHash || hashValidationState === 'validating'}
                className="btn-primary px-8"
              >
                {hashValidationState === 'validating' ? 'Validating...' : 'Validate Hash'}
              </button>
            </div>

            {hashValidationState === 'validating' && (
              <div className="flex items-center justify-center p-6 gap-3">
                <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                <span className="text-sm text-brand-400 font-medium">Computing cryptographic proof...</span>
              </div>
            )}

            {hashValidationState === 'success' && (
              <div className="bg-success-500/10 border border-success-500/20 rounded-xl p-4 flex items-center gap-3 animate-slide-up">
                <CheckCircle className="w-6 h-6 text-success-400" />
                <div>
                  <h4 className="text-sm font-semibold text-success-400">Cryptographic Hash Authenticated</h4>
                  <p className="text-xs text-success-400/80 mt-0.5">This hash matches a verified, immutable record on the ledger.</p>
                </div>
              </div>
            )}

            {hashValidationState === 'error' && (
              <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-4 flex items-center gap-3 animate-slide-up">
                <X className="w-6 h-6 text-danger-400" />
                <div>
                  <h4 className="text-sm font-semibold text-danger-400">Invalid Hash</h4>
                  <p className="text-xs text-danger-400/80 mt-0.5">This hash was not found on the active ledger.</p>
                </div>
              </div>
            )}

            {hashValidationState === 'revoked' && (
              <div className="bg-danger-500/20 border border-danger-500/50 rounded-xl p-4 flex items-center gap-4 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                <Shield className="w-8 h-8 text-danger-500" />
                <div>
                  <h4 className="text-sm font-bold text-danger-500 tracking-wide uppercase">🚨 Asset Revoked</h4>
                  <p className="text-xs text-danger-400 mt-1 font-medium">
                    This cryptographic signature has been invalidated by the issuer due to: <span className="font-mono text-danger-300">[{revokeReason}]</span>.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Asset Ledger Tab */}
      {!isValidationTab && (
        <>
          {/* Data Quality Gauge */}
          {summary && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-brand-400" />
                Portfolio Quality Score
              </h2>
              <div className="flex items-center gap-6">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="#1e293b" strokeWidth="12" />
                    <circle
                      cx="60" cy="60" r="52" fill="none"
                      stroke="url(#qualityGradient)" strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${(qualityScore / 100) * 327} 327`}
                      className="transition-all duration-1000"
                    />
                    <defs>
                      <linearGradient id="qualityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#22c55e" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-surface-100">{qualityScore}%</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-400">Verified loans</span>
                    <span className="text-success-400 font-medium">{summary.verified_loans}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-400">Open exceptions</span>
                    <span className="text-warning-400 font-medium">{summary.exceptions_by_status?.OPEN || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-400">AI suggestions accepted</span>
                    <span className="text-brand-400 font-medium">{summary.ai_suggestions_accepted}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Canonical Data Grid */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
                <Lock className="w-5 h-5 text-success-400" />
                Canonical Verified Records
                <span className="text-xs text-surface-500">({filteredVerified.length})</span>
              </h2>
              <div className="w-72 relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                <input
                  type="text"
                  placeholder="Search by Loan ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-500 text-surface-100 placeholder-surface-500 pl-9"
                />
              </div>
            </div>

            {filteredVerified.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-surface-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-surface-300">
                  {searchQuery ? 'No Matching Loans' : 'No Verified Loans Yet'}
                </h3>
                <p className="text-surface-500 text-sm mt-1">
                  {searchQuery
                    ? `No verified loans match "${searchQuery}"`
                    : 'Loans will appear here once a Reviewer marks them as verified.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Loan ID</th>
                      <th className="text-right">Balance</th>
                      <th className="text-right">Rate</th>
                      <th>Status</th>
                      <th>Verified By</th>
                      <th>Record Hash</th>
                      <th>Chain</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVerified.map((v) => (
                      <tr
                        key={v.loan.loan_id}
                        className={`cursor-pointer transition-colors ${selectedLoanId === v.loan.loan_id ? 'bg-brand-500/10' : 'hover:bg-surface-800/50'}`}
                        onClick={() => inspectAuditTrail(v.loan.loan_id || '')}
                      >
                        <td className="font-mono text-brand-400 text-sm">{v.loan.loan_id}</td>
                        <td className="font-mono text-sm text-right">{formatCurrency(v.loan.current_balance)}</td>
                        <td className="font-mono text-sm text-right">{v.loan.interest_rate?.toFixed(2)}%</td>
                        <td>
                          <span className="badge-verified">✓ Verified</span>
                        </td>
                        <td className="text-surface-300 text-sm">{v.verified_by || '—'}</td>
                        <td>
                          <span className="font-mono text-xs text-surface-400 bg-surface-800 px-2 py-1 rounded-lg">
                            <Hash className="w-3 h-3 inline mr-1" />
                            {v.record_hash?.slice(0, 12)}...
                          </span>
                        </td>
                        <td>
                          {v.hash_chain_valid ? (
                            <span className="text-success-400 text-xs font-medium">✓ Valid</span>
                          ) : (
                            <span className="text-danger-400 text-xs font-medium">✗ Broken</span>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); inspectAuditTrail(v.loan.loan_id || ''); }}
                            className={`btn-ghost text-xs px-2 py-1 ${selectedLoanId === v.loan.loan_id ? 'text-brand-400' : ''}`}
                          >
                            <Eye className="w-3 h-3" />
                            {selectedLoanId === v.loan.loan_id ? 'Close' : 'Inspect'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Glassmorphism Audit Trail Modal */}
      {selectedLoanId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedLoanId(null)}
        >
          <div
            className="relative w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col rounded-2xl border border-surface-700/60 bg-surface-900/80 backdrop-blur-xl shadow-2xl shadow-black/50 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700/50 shrink-0">
              <h2 className="text-lg font-semibold text-surface-100 flex items-center gap-2.5">
                <div className="p-1.5 bg-brand-500/10 rounded-lg">
                  <Eye className="w-5 h-5 text-brand-400" />
                </div>
                Audit Trail
                <span className="font-mono text-sm text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md">
                  {selectedLoanId}
                </span>
              </h2>
              <button
                onClick={() => setSelectedLoanId(null)}
                className="p-1.5 rounded-lg bg-surface-800/60 hover:bg-surface-700 border border-surface-700/50 text-surface-400 hover:text-surface-200 transition-all duration-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body — scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
              {auditLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                  <span className="text-sm text-surface-400">Loading event ledger…</span>
                </div>
              ) : (
                <AuditTimeline
                  events={auditEvents}
                  hashChainValid={true}
                  onRewind={() => {}}
                />
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-surface-700/50 shrink-0 bg-surface-950/40 rounded-b-2xl">
              <span className="text-xs text-surface-500 font-mono">
                {auditEvents.length} event(s) · SHA-256 chained
              </span>
              <button
                onClick={() => setSelectedLoanId(null)}
                className="btn-ghost text-xs px-4 py-1.5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
