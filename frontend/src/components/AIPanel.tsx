import { Bot, CheckCircle, Sparkles } from 'lucide-react';
import type { AISuggestion } from '../types';

interface AIPanelProps {
  loading: boolean;
  aiData: AISuggestion | null;
  resolving: boolean;
  comment: string;
  onCommentChange: (val: string) => void;
  onRequestAI: () => void;
  onResolve: (applyAI: boolean) => void;
}

export default function AIPanel({
  loading,
  aiData,
  resolving,
  comment,
  onCommentChange,
  onRequestAI,
  onResolve
}: AIPanelProps) {
  
  if (!aiData && !loading) {
    return (
      <button
        onClick={onRequestAI}
        className="btn-secondary w-full justify-center group overflow-hidden relative"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-cyan-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <Sparkles className="w-4 h-4 text-brand-400 group-hover:scale-110 transition-transform duration-300" />
        <span className="relative z-10 ai-gradient-text">Request AI Analysis</span>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="ai-border-glow bg-surface-900/80 rounded-xl p-5 text-center animate-copilot-pulse">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-800 flex items-center justify-center border border-surface-700">
            <Bot className="w-4 h-4 text-brand-400 animate-pulse" />
          </div>
          <span className="text-sm font-medium ai-gradient-text">Copilot is analyzing this exception...</span>
        </div>
      </div>
    );
  }

  if (aiData) {
    // Confidence Meter Logic
    const confPercent = aiData.confidence * 100;
    let confColor = 'bg-danger-500'; // < 70%
    if (confPercent >= 90) confColor = 'bg-success-500';
    else if (confPercent >= 70) confColor = 'bg-warning-500';

    return (
      <div className="ai-border-glow bg-surface-900/60 rounded-xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-brand-400" />
          <span className="text-sm font-semibold ai-gradient-text">Intain Copilot Suggestion</span>
        </div>

        {/* Explanation */}
        <p className="text-sm text-surface-200 leading-relaxed">
          {aiData.explanation}
        </p>

        {/* Confidence Meter */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-surface-400">Confidence Score</span>
            <span className="text-surface-200 font-mono">{confPercent.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${confColor} transition-all duration-1000 ease-out`}
              style={{ width: `${confPercent}%` }}
            />
          </div>
        </div>

        {/* Suggested Patch */}
        {aiData.suggested_patch && Object.keys(aiData.suggested_patch).length > 0 && (
          <div className="bg-surface-950 border border-surface-800 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Suggested Patch (JSON)</div>
            <pre className="text-brand-300 font-mono text-xs overflow-x-auto">
              {JSON.stringify(aiData.suggested_patch, null, 2)}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 border-t border-surface-800 space-y-3">
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Reviewer notes (optional)..."
            className="input-field text-sm h-12 resize-none"
          />
          
          <div className="flex gap-2">
            <button
              onClick={() => onResolve(true)}
              disabled={resolving}
              className="btn-primary flex-1 justify-center text-sm"
            >
              <CheckCircle className="w-4 h-4" />
              Accept AI Fix
            </button>
            <button
              onClick={() => onResolve(false)}
              disabled={resolving}
              className="btn-secondary flex-1 justify-center text-sm"
            >
              Resolve Manually
            </button>
          </div>
        </div>

        {/* Metadata Footer */}
        <div className="flex items-center justify-between text-[10px] text-surface-600 font-mono mt-2 pt-2">
          <span>Model: {aiData.model_name}</span>
          <span>Gen: {new Date(aiData.generated_at).toISOString()}</span>
        </div>
      </div>
    );
  }

  return null;
}
