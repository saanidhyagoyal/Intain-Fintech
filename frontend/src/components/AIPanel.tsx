import { useState } from 'react';
import { Bot, CheckCircle, Sparkles, Terminal, ChevronDown, ChevronUp, Shield, RefreshCw } from 'lucide-react';
import type { AISuggestion } from '../types';

interface AIPanelProps {
  loading: boolean;
  aiData: AISuggestion | null;
  aiError?: boolean;
  resolving: boolean;
  comment: string;
  onCommentChange: (val: string) => void;
  onRequestAI: () => void;
  onResolve: (applyAI: boolean) => void;
}

export default function AIPanel({
  loading,
  aiData,
  aiError,
  resolving,
  comment,
  onCommentChange,
  onRequestAI,
  onResolve
}: AIPanelProps) {
  const [showTrace, setShowTrace] = useState(false);

  if (aiError && !loading) {
    return (
      <div className="bg-danger-500/10 border border-danger-500/20 rounded-xl p-5 text-center">
        <Bot className="w-8 h-8 text-danger-400 mx-auto mb-3" />
        <h4 className="text-sm font-semibold text-danger-400 mb-1">AI Analysis Failed</h4>
        <p className="text-xs text-danger-400/80 mb-4">The copilot was unable to process this exception. The model might be overloaded or the API key may be rate limited.</p>
        <button
          onClick={onRequestAI}
          className="btn-primary w-full justify-center text-sm"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry Analysis
        </button>
      </div>
    );
  }

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

    const stepIcon: Record<string, string> = {
      PROMPT_DISPATCHED: '📤',
      RAW_LLM_RESPONSE: '🤖',
      GUARDRAIL_EXECUTION: '🛡️',
    };

    const stepColor: Record<string, string> = {
      OK: 'text-success-400',
      PASS: 'text-success-400',
      WARN: 'text-warning-400',
      FAIL: 'text-danger-400',
    };

    return (
      <div className="ai-border-glow bg-surface-900/60 rounded-xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-brand-400" />
            <span className="text-sm font-semibold ai-gradient-text">Intain Copilot Suggestion</span>
          </div>
          <div className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wider font-semibold border border-brand-500/30 bg-brand-500/10 text-brand-300">
            {aiData.model_name.toUpperCase()}
          </div>
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

        {/* Agentic Trace Toggle */}
        {aiData.agentic_trace && aiData.agentic_trace.length > 0 && (
          <div className="border-t border-surface-800 pt-3">
            <button
              onClick={() => setShowTrace(!showTrace)}
              className="flex items-center gap-2 text-xs font-medium text-surface-400 hover:text-surface-200 transition-colors w-full"
            >
              <Terminal className="w-3.5 h-3.5" />
              <Shield className="w-3.5 h-3.5" />
              <span>View Agentic Trace & Guardrails</span>
              <span className="ml-auto">
                {showTrace ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </button>

            {showTrace && (
              <div className="mt-3 bg-[#0d1117] border border-surface-800 rounded-xl overflow-hidden">
                {aiData.agentic_trace.map((step, idx) => (
                  <div key={idx} className={`p-4 ${idx > 0 ? 'border-t border-surface-800/50' : ''}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{stepIcon[step.step] || '▸'}</span>
                      <span className="text-xs font-bold text-surface-300 uppercase tracking-wider">
                        [{step.step}]
                      </span>
                      <span className={`text-[10px] font-mono ml-auto ${stepColor[step.status] || 'text-surface-500'}`}>
                        {step.status}
                      </span>
                    </div>
                    <pre className="font-mono text-[11px] text-surface-400 whitespace-pre-wrap break-all leading-relaxed max-h-48 overflow-y-auto scrollbar-thin">
                      {step.content}
                    </pre>
                  </div>
                ))}
              </div>
            )}
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
          <button
            onClick={onRequestAI}
            disabled={resolving}
            className="btn-ghost w-full justify-center text-sm mt-2 text-brand-400 hover:text-brand-300 hover:bg-brand-500/10"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Regenerate Analysis
          </button>
        </div>

        {/* Metadata Footer */}
        <div className="flex items-center justify-end text-[10px] text-surface-600 font-mono mt-2 pt-2">
          <span>Gen: {new Date(aiData.generated_at).toISOString()}</span>
        </div>
      </div>
    );
  }

  return null;
}
