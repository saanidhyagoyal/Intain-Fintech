import { useEffect, useState } from 'react';
import { Upload, AlertTriangle, Database, Activity, FileText, TrendingUp } from 'lucide-react';
import api from '../api/client';
import StatsCard from '../components/StatsCard';
import UploadZone from '../components/UploadZone';
import Table from '../components/Table';
import type { SummaryResponse, LoanState } from '../types';
import { useNavigate } from 'react-router-dom';

export default function OperatorDash() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loans, setLoans] = useState<LoanState[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sumRes, loanRes] = await Promise.all([
        api.get('/summary'),
        api.get('/loans?page_size=10'),
      ]);
      setSummary(sumRes.data);
      setLoans(loanRes.data.loans);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (loading || !summary) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="skeleton h-8 w-1/3" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Data Operator Dashboard</h1>
        <p className="text-surface-400 mt-1">Ingest, validate, and monitor loan data quality</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard icon={<Database className="w-5 h-5 text-brand-400" />} label="Total Loans" value={summary.total_loans} color="brand" delay={0} />
        <StatsCard icon={<Activity className="w-5 h-5 text-info-400" />} label="Total Events" value={summary.total_events} color="info" delay={100} />
        <StatsCard icon={<AlertTriangle className="w-5 h-5 text-warning-400" />} label="Open Exceptions" value={summary.exceptions_by_status.OPEN} color="warning" delay={200} />
        <StatsCard icon={<TrendingUp className="w-5 h-5 text-success-400" />} label="Data Quality" value={`${summary.data_quality_score}%`} color="success" delay={300} />
      </div>

      {/* Upload Zone */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-brand-400" />
          Ingest Data
        </h2>
        <UploadZone onUploadComplete={() => fetchData()} />
      </div>

      {/* Recent uploads */}
      {summary.recent_uploads.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-400" />
            Recent Uploads
          </h2>
          <div className="space-y-2">
            {summary.recent_uploads.map((upload, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-surface-800/40 rounded-xl">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-surface-400" />
                  <span className="text-sm text-surface-200 font-medium">{upload.filename}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-surface-400">
                  <span>{upload.records} records</span>
                  <span>{upload.uploaded_at ? new Date(upload.uploaded_at).toLocaleString() : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Loans */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-400" />
            Recent Loans
          </h2>
          <button onClick={() => navigate('/loans')} className="btn-ghost text-sm">
            View All →
          </button>
        </div>
        <Table loans={loans} compact onRowClick={(id) => navigate(`/loans/${id}`)} />
      </div>
    </div>
  );
}
