import { useState } from 'react';
import { CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api/client';
import AIPanel from './AIPanel';
import type { ExceptionRecord as ExcType, AISuggestion } from '../types';

interface ExceptionCardProps {
  exception: ExcType;
  onResolve?: () => void;
}

export default function ExceptionCard({ exception, onResolve }: ExceptionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiData, setAiData] = useState<AISuggestion | null>(exception.ai_suggestion);
  const [resolving, setResolving] = useState(false);
  const [comment, setComment] = useState('');

  const severityConfig: Record<string, { class: string; icon: string }> = {
    CRITICAL: { class: 'badge-critical', icon: '🔴' },
    HIGH: { class: 'badge-high', icon: '🟠' },
    MEDIUM: { class: 'badge-medium', icon: '🔵' },
    LOW: { class: 'badge-low', icon: '⚪' },
  };

  const statusConfig: Record<string, { class: string }> = {
    OPEN: { class: 'badge-open' },
    IN_REVIEW: { class: 'badge-in-review' },
    RESOLVED: { class: 'badge-resolved' },
  };

  const requestAI = async () => {
    setLoadingAI(true);
    try {
      const res = await api.post(`/ai/explain/${exception.id}`);
      setAiData(res.data.suggestion);
    } catch { /* ignore */ }
    setLoadingAI(false);
  };

  const resolve = async (applyAI: boolean) => {
    setResolving(true);
    try {
      await api.patch(`/exceptions/${exception.id}/resolve`, {
        apply_ai_suggestion: applyAI,
        manual_patch: applyAI ? undefined : aiData?.suggested_patch || {},
        reviewer_comment: comment || undefined,
      });
      onResolve?.();
    } catch { /* ignore */ }
    setResolving(false);
  };

  const sev = severityConfig[exception.severity] || severityConfig.MEDIUM;
  const stat = statusConfig[exception.status] || statusConfig.OPEN;

  return (
    <div className="glass-card-hover p-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={sev?.class || severityConfig.MEDIUM.class}>{sev?.icon || severityConfig.MEDIUM.icon} {exception?.severity}</span>
            <span className={stat?.class || statusConfig.OPEN.class}>{exception?.status}</span>
            <span className="text-xs text-surface-500 font-mono">#{exception?.id}</span>
          </div>
          <h3 className="mt-2 font-semibold text-surface-100 truncate">
            {exception?.field_name}
            <span className="text-surface-400 font-normal ml-2 text-sm">
              on loan {exception?.loan_id}
            </span>
          </h3>
          <p className="text-sm text-surface-400 mt-1">{exception?.description}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="btn-ghost p-2"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Details */}
      {expanded && (
        <div className="mt-4 space-y-4 animate-slide-up">
          {/* Field values */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-danger-500/10 rounded-xl p-3">
              <div className="text-xs text-danger-400 font-medium mb-1">Actual Value</div>
              <div className="text-sm font-mono text-surface-200">{exception.actual_value || '—'}</div>
            </div>
            <div className="bg-success-500/10 rounded-xl p-3">
              <div className="text-xs text-success-400 font-medium mb-1">Expected</div>
              <div className="text-sm font-mono text-surface-200">{exception.expected_value || '—'}</div>
            </div>
          </div>

          {/* AI Section */}
          {exception.status !== 'RESOLVED' && (
            <div className="border-t border-surface-700/50 pt-4 mt-4">
              <AIPanel
                loading={loadingAI}
                aiData={aiData}
                resolving={resolving}
                comment={comment}
                onCommentChange={setComment}
                onRequestAI={requestAI}
                onResolve={resolve}
              />
            </div>
          )}

          {/* Resolved info */}
          {exception.status === 'RESOLVED' && (
            <div className="flex items-center gap-2 text-success-400 bg-success-500/10 border border-success-500/20 rounded-xl p-3 mt-4">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">
                Resolved ({exception.resolution_type})
                {exception.reviewer_comment && <span className="text-surface-300 ml-1 font-normal">— "{exception.reviewer_comment}"</span>}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
