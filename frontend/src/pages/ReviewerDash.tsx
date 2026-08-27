import { useEffect, useState } from 'react';
import { AlertCircle, Filter, Bot, CheckCircle, Sparkles, RefreshCw } from 'lucide-react';
import api from '../api/client';
import ExceptionCard from '../components/ExceptionCard';
import StatsCard from '../components/StatsCard';
import type { ExceptionRecord, SummaryResponse } from '../types';

export default function ReviewerDash() {
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [healingResult, setHealingResult] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSeverity) params.set('severity', filterSeverity);
      if (filterStatus) params.set('status', filterStatus);
      params.set('page_size', '50');

      const [excRes, sumRes] = await Promise.all([
        api.get(`/exceptions?${params.toString()}`),
        api.get('/summary'),
      ]);
      setExceptions(excRes.data.exceptions);
      setSummary(sumRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filterSeverity, filterStatus]);

  const triggerSelfHealing = async () => {
    try {
      const res = await api.post('/ai/suggest-rule', { min_occurrences: 3 });
      setHealingResult(`New rule created: "${res.data.rule_name}" for field "${res.data.field_name}"`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'No patterns found yet';
      setHealingResult(detail);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Reviewer Dashboard</h1>
          <p className="text-surface-400 mt-1">Review exceptions, apply AI fixes, and verify loans</p>
        </div>
        <button onClick={triggerSelfHealing} className="btn-secondary text-sm">
          <Sparkles className="w-4 h-4 text-brand-400" />
          Self-Healing Check
        </button>
      </div>

      {/* Healing result */}
      {healingResult && (
        <div className="glass-card p-4 border-brand-500/30 animate-slide-up">
          <div className="flex items-center gap-2 text-brand-400 text-sm">
            <Bot className="w-4 h-4" />
            {healingResult}
          </div>
          <button onClick={() => setHealingResult(null)} className="text-xs text-surface-500 mt-1 hover:text-surface-300">
            Dismiss
          </button>
        </div>
      )}

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard icon={<AlertCircle className="w-5 h-5 text-danger-400" />} label="Critical" value={summary.exceptions_by_severity.CRITICAL} color="danger" delay={0} />
          <StatsCard icon={<AlertCircle className="w-5 h-5 text-warning-400" />} label="High" value={summary.exceptions_by_severity.HIGH} color="warning" delay={100} />
          <StatsCard icon={<CheckCircle className="w-5 h-5 text-success-400" />} label="Resolved" value={summary.exceptions_by_status.RESOLVED} color="success" delay={200} />
          <StatsCard icon={<Bot className="w-5 h-5 text-info-400" />} label="AI Suggestions" value={summary.ai_suggestions_generated} color="info" delay={300} />
          <StatsCard icon={<Sparkles className="w-5 h-5 text-brand-400" />} label="Auto Rules" value={summary.self_healing_rules} color="brand" delay={400} />
        </div>
      )}

      {/* Filters */}
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

          <button onClick={fetchData} className="btn-ghost text-sm">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>

          <span className="text-xs text-surface-500 ml-auto">
            {exceptions.length} exception(s)
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
      ) : exceptions.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <CheckCircle className="w-12 h-12 text-success-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-surface-200">All Clear</h3>
          <p className="text-surface-400 text-sm mt-1">
            No exceptions match your current filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {exceptions.map((exc) => (
            <ExceptionCard key={exc.id} exception={exc} onResolve={fetchData} />
          ))}
        </div>
      )}
    </div>
  );
}
