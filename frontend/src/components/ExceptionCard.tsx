import { useState } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, Edit3, X, RotateCcw } from 'lucide-react';
import api from '../api/client';
import AIPanel from './AIPanel';
import ReasonModal from './ReasonModal';
import type { ExceptionRecord as ExcType, AISuggestion } from '../types';

interface ExceptionCardProps {
  exception: ExcType;
  onResolve?: () => void;
  lockedById?: number | null;
  lockedByUsername?: string | null;
}

export default function ExceptionCard({ exception, onResolve, lockedById, lockedByUsername }: ExceptionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiData, setAiData] = useState<AISuggestion | null>(exception.ai_suggestion);
  const [aiError, setAiError] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [comment, setComment] = useState('');
  
  // Manual Resolution Modal State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualValue, setManualValue] = useState('');

  // Rework Modal State
  const [showReworkModal, setShowReworkModal] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

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
    setAiError(false);
    setAiData(null);
    try {
      const res = await api.post(`/ai/explain/${exception.id}`);
      setAiData(res.data.suggestion);
    } catch { 
      setAiError(true);
    }
    setLoadingAI(false);
  };

  const resolve = async (applyAI: boolean, manualData?: any) => {
    if (!applyAI && !manualData) {
      setShowManualModal(true);
      return;
    }
    setResolving(true);
    try {
      const payload = {
        apply_ai_suggestion: applyAI,
        manual_patch: applyAI ? undefined : (manualData ? { [exception.field_name]: manualData } : (aiData?.suggested_patch || {})),
        reviewer_comment: comment || undefined,
      };
      await api.patch(`/exceptions/${exception.id}/resolve`, payload);
      setShowManualModal(false);
      onResolve?.();
    } catch { /* ignore */ }
    setResolving(false);
  };

  const [undoing, setUndoing] = useState(false);

  const undoResolve = async () => {
    setUndoing(true);
    try {
      await api.patch(`/exceptions/${exception.id}/return`, { reason: "Maker reverted resolution" });
      onResolve?.();
    } catch {
      alert("Failed to undo resolution.");
    }
    setUndoing(false);
  };

  const returnRework = async (reason: string) => {
    setIsReturning(true);
    try {
      await api.patch(`/exceptions/${exception.id}/return`, { reason });
      setShowReworkModal(false);
      onResolve?.();
    } catch {
      alert("Failed to return exception for rework.");
    }
    setIsReturning(false);
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
          {lockedById && String(lockedById) !== String(currentUser.user_id) && exception.status === 'OPEN' && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-warning-400 bg-warning-500/10 border border-warning-500/20 rounded-lg">
              <span className="text-sm">🔒</span> Locked by Maker: {lockedByUsername || lockedById}
            </div>
          )}
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

          {/* Resolve Actions */}
          {exception.status === 'OPEN' && (!lockedById || String(lockedById) === String(currentUser.user_id)) && (
            <div className="border-t border-surface-700/50 pt-4 mt-4">
              <AIPanel
                loading={loadingAI}
                aiData={aiData}
                aiError={aiError}
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
            <div className="flex items-center justify-between bg-success-500/10 border border-success-500/20 rounded-xl p-3 mt-4">
              <div className="flex items-center gap-2 text-success-400">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  Resolved ({exception.resolution_type})
                  {exception.reviewer_comment && <span className="text-surface-300 ml-1 font-normal">— "{exception.reviewer_comment}"</span>}
                </span>
              </div>
              <div className="flex gap-2">
                {currentUser.user_id !== exception.resolved_by && (
                  <button
                    onClick={() => setShowReworkModal(true)}
                    disabled={undoing || isReturning}
                    className="btn-ghost text-xs px-2 py-1 flex items-center gap-1.5 text-warning-400 hover:text-warning-300 hover:bg-warning-500/10 border border-warning-500/20"
                  >
                    Return for Rework
                  </button>
                )}
                {currentUser.user_id === exception.resolved_by && (
                  <button
                    onClick={undoResolve}
                    disabled={undoing}
                    className="btn-ghost text-xs px-2 py-1 flex items-center gap-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-800"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${undoing ? 'animate-spin' : ''}`} />
                    {undoing ? 'Undoing...' : 'Undo'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Resolution Glassmorphism Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-md animate-fade-in" onClick={() => setShowManualModal(false)}>
          <div className="relative w-full max-w-md mx-4 p-6 rounded-2xl border border-surface-700/60 bg-surface-900/90 backdrop-blur-xl shadow-2xl shadow-black/50 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-brand-400" />
                Manual Resolution
              </h2>
              <button onClick={() => setShowManualModal(false)} className="text-surface-500 hover:text-surface-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-surface-800/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-surface-400">Field</span>
                  <span className="text-surface-200 font-mono">{exception.field_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-400">Current Value</span>
                  <span className="text-danger-400 font-mono">{exception.actual_value || 'MISSING'}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-400 mb-1">Corrected Value</label>
                <input
                  type="text"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  placeholder="Enter the correct value..."
                  className="w-full bg-surface-950 border border-surface-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 text-surface-100 placeholder-surface-600"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-400 mb-1">Resolution Note (Optional)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Why was this changed?"
                  className="w-full bg-surface-950 border border-surface-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 text-surface-100 placeholder-surface-600 resize-none h-16"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => setShowManualModal(false)}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  onClick={() => resolve(false, manualValue)}
                  disabled={resolving || !manualValue.trim()}
                  className="btn-primary flex-1 justify-center"
                >
                  {resolving ? 'Saving...' : 'Save Correction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rework Modal */}
      <ReasonModal
        isOpen={showReworkModal}
        onClose={() => setShowReworkModal(false)}
        onSubmit={returnRework}
        title="Return for Rework"
        placeholder="Explain why this resolution is incorrect..."
        loading={isReturning}
      />
    </div>
  );
}
