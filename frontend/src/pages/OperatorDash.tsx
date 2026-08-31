import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Upload, Database, FileText, TrendingUp, CheckCircle, AlertTriangle, FileWarning, ArrowRight, Download } from 'lucide-react';
import api from '../api/client';
import StatsCard from '../components/StatsCard';
import UploadZone from '../components/UploadZone';
import type { SummaryResponse } from '../types';

function OperatorHub({ summary, fetchData }: { summary: SummaryResponse; fetchData: () => void }) {
  const cleanRows = summary.clean_rows ?? Math.max(0, summary.total_loans - (summary.loans_with_open_exceptions ?? 0));
  const cleanPercent = summary.total_loans > 0 ? Math.round((cleanRows / summary.total_loans) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Ingestion Triage Gauge */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-brand-400" />
          Ingestion Triage Breakdown
        </h2>
        <div className="flex items-center gap-6">
          <div className="flex-1">
            <div className="w-full h-4 bg-surface-800 rounded-full overflow-hidden">
              <div className="h-full flex">
                <div className="bg-success-500 transition-all duration-1000" style={{ width: `${cleanPercent}%` }} />
                <div className="bg-warning-500 transition-all duration-1000" style={{ width: `${100 - cleanPercent}%` }} />
              </div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-surface-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success-500 inline-block" />
                {cleanRows} Auto-Validated
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-warning-500 inline-block" />
                {summary.exceptions_by_status?.OPEN || 0} Routed to Exception Queue
              </span>
            </div>
          </div>
          <div className="text-center px-6 border-l border-surface-700">
            <div className="text-3xl font-bold text-brand-400">{summary.total_loans}</div>
            <div className="text-xs text-surface-400 mt-1">Total Rows</div>
          </div>
        </div>
      </div>

      {/* Multi-Source Ingestion Pipeline */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-surface-100 mb-2 flex items-center gap-2">
          <Upload className="w-5 h-5 text-brand-400" />
          Multi-Source Ingestion Pipeline
        </h2>
        <p className="text-sm text-surface-500 mb-6">Upload CSVs independently or sequentially. Each file type targets a different aspect of the loan lifecycle.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-800/40 rounded-2xl p-5 border border-surface-700/50 hover:border-brand-500/30 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-brand-500/10 rounded-xl">
                <FileText className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-200">Primary Loan Tape</h3>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">loan_tape.csv</p>
              </div>
            </div>
            <p className="text-xs text-surface-400 mb-4">Originator's core loan data: principal, rates, terms, and borrower details.</p>
            <UploadZone onUploadComplete={fetchData} defaultSourceType="loan_tape" compact />
          </div>

          <div className="bg-surface-800/40 rounded-2xl p-5 border border-surface-700/50 hover:border-info-500/30 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-info-500/10 rounded-xl">
                <ArrowRight className="w-5 h-5 text-info-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-200">Servicer Reconciliation</h3>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">servicer_update.csv</p>
              </div>
            </div>
            <p className="text-xs text-surface-400 mb-4">Servicer's operational data: current balances, payment statuses, and delinquencies.</p>
            <UploadZone onUploadComplete={fetchData} defaultSourceType="servicer_update" compact />
          </div>

          <div className="bg-surface-800/40 rounded-2xl p-5 border border-surface-700/50 hover:border-warning-500/30 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-warning-500/10 rounded-xl">
                <FileWarning className="w-5 h-5 text-warning-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-200">Document Custody</h3>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">document_manifest.csv</p>
              </div>
            </div>
            <p className="text-xs text-surface-400 mb-4">Custodial vault status: promissory notes, title deeds, and KYC document presence.</p>
            <UploadZone onUploadComplete={fetchData} defaultSourceType="document_manifest" compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function OperatorLogs({ summary }: { summary: SummaryResponse }) {

  const downloadComplianceReport = (e: React.MouseEvent) => {
    e.preventDefault();
    // Generate a simple CSV blob from the summary data
    const csvRows = [
      ["Metric", "Value"],
      ["Total Loans Ingested", summary.total_loans],
      ["Clean Rows", summary.clean_rows ?? 0],
      ["Exceptions Flagged", summary.exceptions_by_status?.OPEN || 0],
      ["Data Quality Score", `${summary.data_quality_score}%`]
    ];
    const csvString = csvRows.map(row => row.join(",")).join("\n");
    // Add BOM for Excel compatibility
    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'compliance_report.csv');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(url), 2000);
  };

  if (summary.recent_uploads.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <FileText className="w-12 h-12 text-surface-600 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-surface-300">No Compliance Logs Yet</h3>
        <p className="text-surface-500 text-sm mt-1">Upload CSVs in the Hub to see lineage history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
          <Database className="w-5 h-5 text-brand-400" />
          Health & Compliance Logs
        </h2>
        <button onClick={downloadComplianceReport} className="btn-primary text-sm">
          <Download className="w-4 h-4" />
          Download Compliance Report
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl">
        <table className="data-table">
          <thead>
            <tr>
              <th>Source File</th>
              <th className="text-right">Records</th>
              <th className="text-right">Exceptions</th>
              <th>Uploaded At</th>
            </tr>
          </thead>
          <tbody>
            {summary.recent_uploads.map((upload, i) => (
              <tr key={i}>
                <td>
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-surface-500" />
                    <span className="font-mono text-sm text-surface-200">{upload.filename}</span>
                  </div>
                </td>
                <td className="text-right font-mono text-sm">{upload.records}</td>
                <td className="text-right font-mono text-sm text-warning-400">{upload.exceptions ?? 0}</td>
                <td className="text-surface-400 text-sm">{upload.uploaded_at ? new Date(upload.uploaded_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OperatorDash() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const isComplianceTab = location.pathname.includes('/compliance');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/summary');
      setSummary(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (loading || !summary) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-1/3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  const cleanRows = summary.clean_rows ?? Math.max(0, summary.total_loans - (summary.loans_with_open_exceptions ?? 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Loan Ingestion & Pipeline Orchestration</h1>
        <p className="text-surface-400 mt-1">Multi-source CSV ingestion, schema mapping, and data quality triage</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard icon={<Database className="w-5 h-5 text-brand-400" />} label="Total Loans Ingested" value={summary.total_loans} color="brand" delay={0} />
        <StatsCard icon={<CheckCircle className="w-5 h-5 text-success-400" />} label="Clean Rows" value={cleanRows} color="success" delay={100} />
        <StatsCard icon={<AlertTriangle className="w-5 h-5 text-warning-400" />} label="Exceptions Flagged" value={summary.exceptions_by_status?.OPEN || 0} color="warning" delay={200} />
        <StatsCard icon={<TrendingUp className="w-5 h-5 text-info-400" />} label="Data Quality Score" value={`${summary.data_quality_score}%`} color="info" delay={300} />
      </div>

      {isComplianceTab ? (
        <OperatorLogs summary={summary} />
      ) : (
        <OperatorHub summary={summary} fetchData={fetchData} />
      )}
    </div>
  );
}
