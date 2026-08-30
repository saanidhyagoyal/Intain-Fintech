import { useEffect, useState } from 'react';
import { AlertCircle, Filter, Bot, CheckCircle, Sparkles, RefreshCw, Search, Cpu, Zap, Eye, ShieldCheck, Rocket } from 'lucide-react';
import api from '../api/client';
import ExceptionCard from '../components/ExceptionCard';
import StatsCard from '../components/StatsCard';
import AuditTimeline from '../components/AuditTimeline';
import type { ExceptionRecord, SummaryResponse, LoanEvent } from '../types';

export default function ReviewerDash() {
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchLoanId, setSearchLoanId] = useState<string>('');

  // Audit trail state
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<LoanEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Verify state
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [verifiedLoans, setVerifiedLoans] = useState<Set<string>>(new Set());

  // Bulk verify state
  const [bulkVerifying, setBulkVerifying] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // Self-healing state
  const [healingResult, setHealingResult] = useState<string | null>(null);
  const [healingLoading, setHealingLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/exceptions?page_size=200`;
      if (filterSeverity) url += `&severity=${filterSeverity}`;
      if (filterStatus) url += `&status=${filterStatus}`;
      if (searchLoanId) url += `&loan_id=${searchLoanId}`;

      const [excRes, sumRes] = await Promise.all([
        api.get(url),
        api.get('/summary'),
      ]);
      setExceptions(excRes.data.exceptions);
      setSummary(sumRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 400);
    return () => clearTimeout(timer);
  }, [filterSeverity, filterStatus, searchLoanId]);

  // The backend already filters the results, so filteredExceptions is just exceptions
  const filteredExceptions = exceptions;

  // Get unique loan IDs that have all exceptions resolved
  const loanExceptionMap: Record<string, { total: number; resolved: number }> = {};
  exceptions.forEach(e => {
    if (!loanExceptionMap[e.loan_id]) loanExceptionMap[e.loan_id] = { total: 0, resolved: 0 };
    loanExceptionMap[e.loan_id].total++;
    if (e.status === 'RESOLVED') loanExceptionMap[e.loan_id].resolved++;
  });

  const inspectAuditTrail = async (loanId: string) => {
    if (selectedLoanId === loanId) {
      setSelectedLoanId(null);
      return;
    }
    setSelectedLoanId(loanId);
    setAuditLoading(true);
    setVerifyMsg(null);
    try {
      const res = await api.get(`/loans/${loanId}`);
      setAuditEvents(res.data.events || []);
    } catch {
      setAuditEvents([]);
    }
    setAuditLoading(false);
  };

  const verifyLoan = async (loanId: string) => {
    setVerifying(true);
    setVerifyMsg(null);
    try {
      await api.post(`/loans/${loanId}/verify`);
      setVerifyMsg(`✅ Loan ${loanId} has been verified and sealed with SHA-256 hash`);
      setVerifiedLoans((prev) => new Set(prev).add(loanId));
      fetchData();
      // Refresh audit trail
      const res = await api.get(`/loans/${loanId}`);
      setAuditEvents(res.data.events || []);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Verification failed';
      setVerifyMsg(`❌ ${detail}`);
    }
    setVerifying(false);
  };

  const triggerSelfHealing = async () => {
    setHealingLoading(true);
    try {
      const res = await api.post('/ai/suggest-rule', { min_occurrences: 3 });
      setHealingResult(`✅ New rule synthesized: "${res.data.rule_name}" for field "${res.data.field_name}"`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'No recurring patterns detected yet.';
      setHealingResult(detail);
    }
    setHealingLoading(false);
  };

  const bulkVerifyClean = async () => {
    setBulkVerifying(true);
    setBulkResult(null);
    try {
      const res = await api.post('/loans/bulk-verify-clean');
      setBulkResult(`✅ ${res.data.message}`);
      fetchData();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Bulk verification failed';
      setBulkResult(`❌ ${detail}`);
    }
    setBulkVerifying(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Exception Triage & Resolution Queue</h1>
        <p className="text-surface-400 mt-1">Review AI-assisted patches, resolve conflicts, and manage self-healing rules</p>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard icon={<AlertCircle className="w-5 h-5 text-danger-400" />} label="Critical" value={summary.exceptions_by_severity?.CRITICAL || 0} color="danger" delay={0} />
          <StatsCard icon={<AlertCircle className="w-5 h-5 text-warning-400" />} label="High" value={summary.exceptions_by_severity?.HIGH || 0} color="warning" delay={100} />
          <StatsCard icon={<CheckCircle className="w-5 h-5 text-success-400" />} label="Resolved" value={summary.exceptions_by_status?.RESOLVED || 0} color="success" delay={200} />
          <StatsCard icon={<Bot className="w-5 h-5 text-info-400" />} label="AI Suggestions" value={summary.ai_suggestions_generated} color="info" delay={300} />
          <StatsCard icon={<Sparkles className="w-5 h-5 text-brand-400" />} label="Auto Rules" value={summary.self_healing_rules} color="brand" delay={400} />
        </div>
      )}

      {/* Fast-Track: Bulk Verify Clean Loans */}
      <div className="glass-card p-4 border-success-500/20 bg-gradient-to-r from-emerald-500/5 to-teal-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success-500/10 rounded-xl">
              <Rocket className="w-5 h-5 text-success-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-success-400" />
                Fast-Track Verification
              </h3>
              <p className="text-xs text-surface-400 mt-0.5">
                Bulk-promote all clean loans (zero unresolved exceptions) to the verified ledger.
              </p>
            </div>
          </div>
          <button
            onClick={bulkVerifyClean}
            disabled={bulkVerifying}
            className="btn-primary text-sm whitespace-nowrap shadow-[0_0_15px_rgba(45,212,191,0.15)]"
          >
            {bulkVerifying ? (
              <div className="w-4 h-4 border-2 border-surface-950/30 border-t-surface-950 rounded-full animate-spin" />
            ) : (
              <Rocket className="w-4 h-4" />
            )}
            {bulkVerifying ? 'Promoting...' : 'Promote Clean Loans to Verified Ledger'}
          </button>
        </div>
        {bulkResult && (
          <div className={`mt-3 pt-3 border-t border-surface-700/50 flex items-center justify-between`}>
            <div className={`flex items-center gap-2 text-sm ${bulkResult.startsWith('✅') ? 'text-success-400' : 'text-danger-400'}`}>
              {bulkResult.startsWith('✅') ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {bulkResult}
            </div>
            <button onClick={() => setBulkResult(null)} className="text-xs text-surface-500 hover:text-surface-300">
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Self-Healing Pipeline */}
      <div className="glass-card p-4 border-brand-500/20 bg-gradient-to-r from-violet-500/5 to-cyan-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 rounded-xl animate-pulse">
              <Cpu className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-warning-400" />
                Self-Healing Pipeline
              </h3>
              <p className="text-xs text-surface-400 mt-0.5">
                Detects 3+ identical manual corrections and synthesizes automated validation rules.
              </p>
            </div>
          </div>
          <button
            onClick={triggerSelfHealing}
            disabled={healingLoading}
            className="btn-secondary text-sm whitespace-nowrap"
          >
            {healingLoading ? (
              <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-brand-400" />
            )}
            Synthesize Rule
          </button>
        </div>
        {healingResult && (
          <div className="mt-3 pt-3 border-t border-surface-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-brand-400 text-sm">
              <Bot className="w-4 h-4" />
              {healingResult}
            </div>
            <button onClick={() => setHealingResult(null)} className="text-xs text-surface-500 hover:text-surface-300">
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-surface-400">
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="input-field w-auto text-sm py-1.5"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field w-auto text-sm py-1.5"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="RESOLVED">Resolved</option>
          </select>

          {/* Loan ID Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              type="text"
              value={searchLoanId}
              onChange={(e) => setSearchLoanId(e.target.value)}
              placeholder="Search Loan ID..."
              className="input-field text-sm py-1.5 pl-9 w-full"
            />
          </div>

          <button onClick={fetchData} className="btn-ghost text-sm">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>

          <span className="text-xs text-surface-500 ml-auto">
            {filteredExceptions.length} exception(s)
          </span>
        </div>
      </div>

      {/* Exception List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card p-4 flex gap-4 h-32">
              <div className="skeleton w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-3">
                <div className="skeleton h-4 w-1/4" />
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton h-12 w-full mt-2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredExceptions.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <CheckCircle className="w-12 h-12 text-success-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-surface-200">All Clear</h3>
          <p className="text-surface-400 text-sm mt-1">
            No exceptions match your current filters.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(
            filteredExceptions.reduce((acc, exc) => {
              if (!acc[exc.loan_id]) acc[exc.loan_id] = [];
              acc[exc.loan_id].push(exc);
              return acc;
            }, {} as Record<string, ExceptionRecord[]>)
          ).map(([loanId, loanExceptions]) => (
            <div key={loanId} className="bg-surface-900/50 rounded-xl border border-surface-700/50 overflow-hidden shadow-sm">
              {/* Loan Header */}
              <div className="px-4 py-3 bg-surface-800/50 border-b border-surface-700/50 flex justify-between items-center">
                <span className="font-mono text-sm font-semibold text-surface-200">
                  Loan ID: {loanId}
                </span>
                <span className="text-xs text-surface-400 bg-surface-950/50 px-2 py-1 rounded-md">
                  {loanExceptions.length} exception(s)
                </span>
              </div>

              {/* Exception Cards */}
              <div className="p-4 space-y-3">
                {loanExceptions.map((exc) => (
                  <ExceptionCard key={exc.id} exception={exc} onResolve={fetchData} />
                ))}
              </div>

              {/* Loan-level Actions (Verify / Audit) */}
              <div className="px-4 py-3 bg-surface-800/30 border-t border-surface-700/50 flex items-center gap-3">
                <button
                  onClick={() => inspectAuditTrail(loanId)}
                  className={`btn-ghost text-xs px-3 py-1.5 ${selectedLoanId === loanId ? 'text-brand-400 bg-brand-500/10' : ''}`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  {selectedLoanId === loanId ? 'Hide Audit Trail' : 'View Audit Trail'}
                </button>
                
                {/* Show verify button if ALL exceptions for this loan are resolved */}
                {loanExceptionMap[loanId] &&
                  loanExceptionMap[loanId].total === loanExceptionMap[loanId].resolved && (
                  verifiedLoans.has(loanId) ? (
                    <div className="flex items-center gap-1.5 px-4 py-1.5 ml-auto text-xs font-medium text-success-400 bg-success-500/10 rounded-lg border border-success-500/20">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Verified
                    </div>
                  ) : (
                    <button
                      onClick={() => verifyLoan(loanId)}
                      disabled={verifying}
                      className="btn-primary text-xs px-4 py-1.5 ml-auto shadow-[0_0_10px_rgba(45,212,191,0.15)]"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {verifying ? 'Verifying...' : 'Verify Loan'}
                    </button>
                  )
                )}
              </div>

              {/* Inline Audit Trail */}
              {selectedLoanId === loanId && (
                <div className="p-4 border-t border-brand-500/20 bg-surface-950/30 animate-slide-up">
                  <h3 className="text-sm font-semibold text-surface-100 mb-4 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-brand-400" />
                    Audit Trail — {loanId}
                  </h3>
                  {verifyMsg && (
                    <div className={`text-sm p-3 rounded-lg mb-4 ${verifyMsg.startsWith('✅') ? 'bg-success-500/10 text-success-400 border border-success-500/20' : 'bg-danger-500/10 text-danger-400 border border-danger-500/20'}`}>
                      {verifyMsg}
                    </div>
                  )}
                  {auditLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-5 h-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <AuditTimeline events={auditEvents} hashChainValid={true} onRewind={() => {}} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
