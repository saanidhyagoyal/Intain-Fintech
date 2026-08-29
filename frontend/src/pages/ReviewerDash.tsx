import { useEffect, useState } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { AlertCircle, Filter, Bot, CheckCircle, Sparkles, RefreshCw, Search, Cpu, Zap } from 'lucide-react';
import api from '../api/client';
import ExceptionCard from '../components/ExceptionCard';
import StatsCard from '../components/StatsCard';
import type { ExceptionRecord, SummaryResponse } from '../types';

export function ExceptionQueue() {
  const { exceptions, fetchData, loading } = useOutletContext<{ exceptions: ExceptionRecord[]; fetchData: () => void; loading: boolean }>();
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchLoanId, setSearchLoanId] = useState<string>('');

  const filteredExceptions = exceptions.filter(e => {
    if (filterSeverity && e.severity !== filterSeverity) return false;
    if (filterStatus && e.status !== filterStatus) return false;
    if (searchLoanId && !e.loan_id.toLowerCase().includes(searchLoanId.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
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
        <div className="space-y-3">
          {filteredExceptions.map((exc) => (
            <ExceptionCard key={exc.id} exception={exc} onResolve={fetchData} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SelfHealingRules() {
  const [healingResult, setHealingResult] = useState<string | null>(null);
  const [healingLoading, setHealingLoading] = useState(false);

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

  return (
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
  );
}

export default function ReviewerDash() {
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [excRes, sumRes] = await Promise.all([
        api.get(`/exceptions?page_size=200`), // fetch a reasonable amount for local filtering
        api.get('/summary'),
      ]);
      setExceptions(excRes.data.exceptions);
      setSummary(sumRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

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

      <Outlet context={{ exceptions, fetchData, loading }} />
    </div>
  );
}
