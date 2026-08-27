import { useEffect, useState } from 'react';
import { Shield, Download, Hash, CheckCircle, TrendingUp, Database, Lock } from 'lucide-react';
import api from '../api/client';
import StatsCard from '../components/StatsCard';
import type { VerifiedLoanResponse, SummaryResponse } from '../types';

export default function ConsumerDash() {
  const [verified, setVerified] = useState<VerifiedLoanResponse[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

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

  const formatCurrency = (val: number | null) =>
    val != null ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="skeleton h-8 w-1/3" />
          <div className="skeleton h-8 w-24 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Data Consumer Dashboard</h1>
          <p className="text-surface-400 mt-1">Access verified, cryptographically-sealed loan records</p>
        </div>
        <button onClick={exportCSV} className="btn-primary text-sm">
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard icon={<Shield className="w-5 h-5 text-success-400" />} label="Verified Loans" value={summary.verified_loans} color="success" delay={0} />
          <StatsCard icon={<Database className="w-5 h-5 text-brand-400" />} label="Total Loans" value={summary.total_loans} color="brand" delay={100} />
          <StatsCard icon={<TrendingUp className="w-5 h-5 text-info-400" />} label="Data Quality" value={`${summary.data_quality_score}%`} color="info" delay={200} />
          <StatsCard icon={<CheckCircle className="w-5 h-5 text-success-400" />} label="Resolution Rate" value={`${summary.resolution_rate}%`} color="success" delay={300} />
        </div>
      )}

      {/* Data Quality Gauge */}
      {summary && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-400" />
            Data Quality Score
          </h2>
          <div className="flex items-center gap-6">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#1e293b" strokeWidth="12" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke="url(#qualityGradient)" strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(summary.data_quality_score / 100) * 327} 327`}
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
                <span className="text-2xl font-bold text-surface-100">{summary.data_quality_score}%</span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">Loans without exceptions</span>
                <span className="text-success-400 font-medium">{summary.total_loans - (summary.exceptions_by_status.OPEN || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">Open exceptions</span>
                <span className="text-warning-400 font-medium">{summary.exceptions_by_status.OPEN}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">AI suggestions accepted</span>
                <span className="text-brand-400 font-medium">{summary.ai_suggestions_accepted}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Verified Records */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
          <Lock className="w-5 h-5 text-success-400" />
          Verified Records
          <span className="text-xs text-surface-500">({verified.length})</span>
        </h2>

        {verified.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-surface-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-surface-300">No Verified Loans Yet</h3>
            <p className="text-surface-500 text-sm mt-1">
              Loans will appear here once a Reviewer marks them as verified.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Loan ID</th>
                  <th>Balance</th>
                  <th>Rate</th>
                  <th>Status</th>
                  <th>Verified By</th>
                  <th>Record Hash</th>
                  <th>Chain</th>
                </tr>
              </thead>
              <tbody>
                {verified.map((v) => (
                  <tr key={v.loan.loan_id}>
                    <td className="font-mono text-brand-400 text-sm">{v.loan.loan_id}</td>
                    <td className="font-mono text-sm">{formatCurrency(v.loan.current_balance)}</td>
                    <td className="font-mono text-sm">{v.loan.interest_rate?.toFixed(2)}%</td>
                    <td>
                      <span className="badge-verified">✓ Verified</span>
                    </td>
                    <td className="text-surface-300 text-sm">{v.verified_by || '—'}</td>
                    <td>
                      <span className="font-mono text-xs text-surface-400 bg-surface-800 px-2 py-1 rounded-lg">
                        <Hash className="w-3 h-3 inline mr-1" />
                        {v.record_hash.slice(0, 12)}...
                      </span>
                    </td>
                    <td>
                      {v.hash_chain_valid ? (
                        <span className="text-success-400 text-xs">✓ Valid</span>
                      ) : (
                        <span className="text-danger-400 text-xs">✗ Broken</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
