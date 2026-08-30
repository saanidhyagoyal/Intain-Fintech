import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  title: string;
  placeholder?: string;
  loading?: boolean;
}

export default function ReasonModal({ isOpen, onClose, onSubmit, title, placeholder = "Enter reason...", loading = false }: ReasonModalProps) {
  const [reason, setReason] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md animate-fade-in" onClick={!loading ? onClose : undefined}>
      <div className="relative w-full max-w-md mx-4 p-6 rounded-2xl border border-slate-700/50 bg-slate-900/80 text-white shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
        
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-warning-400" />
            {title}
          </h2>
          <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Please provide a detailed reason. This note will be permanently appended to the immutable audit ledger.
          </p>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
            className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-warning-500 text-slate-100 placeholder-slate-500 resize-none h-24 shadow-inner"
            autoFocus
          />

          <div className="pt-2 flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2 px-4 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 font-medium transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (reason.trim()) {
                  onSubmit(reason);
                }
              }}
              disabled={loading || !reason.trim()}
              className="flex-1 py-2 px-4 rounded-xl bg-warning-500 hover:bg-warning-600 border border-warning-400/50 text-slate-950 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
              ) : (
                'Confirm & Submit'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
