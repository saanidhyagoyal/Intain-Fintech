import { useState } from 'react';
import { Clock, GitBranch, Hash, Shield, Upload, Bot, User, AlertTriangle, FileWarning, Cog } from 'lucide-react';
import type { LoanEvent, EventType } from '../types';

interface AuditTimelineProps {
  events: LoanEvent[];
  hashChainValid: boolean;
  onRewind?: (timestamp: string) => void;
}

const EVENT_CONFIG: Record<EventType, { icon: React.ReactNode; color: string; label: string }> = {
  LOAN_IMPORTED:        { icon: <Upload className="w-3.5 h-3.5" />,        color: 'bg-brand-500',   label: 'Imported' },
  VALIDATION_FAILED:    { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'bg-danger-500',  label: 'Validation Failed' },
  AI_PATCH_SUGGESTED:   { icon: <Bot className="w-3.5 h-3.5" />,           color: 'bg-purple-500',  label: 'AI Suggestion' },
  HUMAN_EDIT_APPLIED:   { icon: <User className="w-3.5 h-3.5" />,          color: 'bg-info-500',    label: 'Human Edit' },
  AI_SUGGESTION_APPLIED:{ icon: <Bot className="w-3.5 h-3.5" />,           color: 'bg-success-500', label: 'AI Fix Applied' },
  LOAN_VERIFIED:        { icon: <Shield className="w-3.5 h-3.5" />,        color: 'bg-success-500', label: 'Verified' },
  COMMENT_ADDED:        { icon: <User className="w-3.5 h-3.5" />,          color: 'bg-surface-500', label: 'Comment' },
  CONFLICT_DETECTED:    { icon: <FileWarning className="w-3.5 h-3.5" />,   color: 'bg-warning-500', label: 'Conflict' },
  DOCUMENT_MISSING:     { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'bg-warning-500', label: 'Doc Missing' },
  RULE_GENERATED:       { icon: <Cog className="w-3.5 h-3.5" />,           color: 'bg-brand-500',   label: 'Rule Generated' },
};

export default function AuditTimeline({ events, hashChainValid, onRewind }: AuditTimelineProps) {
  const [sliderIdx, setSliderIdx] = useState(events.length - 1);
  const [showRewind, setShowRewind] = useState(false);

  const handleRewind = () => {
    if (onRewind && events[sliderIdx]) {
      onRewind(events[sliderIdx].timestamp);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-brand-400" />
          <h3 className="font-semibold text-surface-100">Event Ledger</h3>
          <span className="text-xs text-surface-500">({events.length} events)</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${
            hashChainValid ? 'text-success-400' : 'text-danger-400'
          }`}>
            <Hash className="w-3.5 h-3.5" />
            {hashChainValid ? 'Chain Valid' : 'Chain Broken!'}
          </div>
          <button
            onClick={() => setShowRewind(!showRewind)}
            className="btn-ghost text-xs"
          >
            <Clock className="w-3.5 h-3.5" />
            Time Travel
          </button>
        </div>
      </div>

      {/* Time Travel Slider */}
      {showRewind && events.length > 0 && (
        <div className="glass-card p-5 animate-slide-up bg-surface-900/80 border-brand-500/30 shadow-[0_0_15px_rgba(45,212,191,0.1)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-brand-400" />
              <span className="text-sm font-semibold text-surface-100">
                Time Travel Scrubber
              </span>
            </div>
            <span className="text-xs text-surface-400 font-mono">
              Event {sliderIdx + 1} / {events.length}
            </span>
          </div>
          
          <div className="relative w-full h-10 flex items-center group">
            {/* Scrubber track */}
            <div className="absolute w-full h-2 bg-surface-800 rounded-full overflow-hidden border border-surface-700/50">
              <div 
                className="h-full bg-gradient-to-r from-brand-600 to-brand-400"
                style={{ width: `${(sliderIdx / (events.length - 1 || 1)) * 100}%` }}
              />
            </div>
            
            <input
              type="range"
              min={0}
              max={events.length - 1}
              value={sliderIdx}
              onChange={(e) => setSliderIdx(Number(e.target.value))}
              className="absolute w-full h-full opacity-0 cursor-pointer z-20"
            />
            
            {/* Custom scrubber thumb (visual only) */}
            <div 
              className="absolute h-5 w-5 bg-surface-50 border-2 border-brand-400 rounded-full shadow-[0_0_10px_rgba(45,212,191,0.5)] z-10 pointer-events-none transition-transform group-hover:scale-125"
              style={{ left: `calc(${(sliderIdx / (events.length - 1 || 1)) * 100}% - 10px)` }}
            />
          </div>

          <div className="flex justify-between text-[10px] text-surface-500 mt-2 font-mono uppercase tracking-wider">
            <span>{events[0]?.timestamp ? new Date(events[0].timestamp).toLocaleDateString() : 'Start'}</span>
            <span className="text-brand-400 font-bold bg-surface-950 px-2 py-1 rounded">
              {events[sliderIdx]?.timestamp
                ? new Date(events[sliderIdx].timestamp).toLocaleString()
                : ''}
            </span>
            <span>{events[events.length - 1]?.timestamp
              ? new Date(events[events.length - 1].timestamp).toLocaleDateString()
              : 'Current'}</span>
          </div>
          
          <button onClick={handleRewind} className="btn-primary mt-5 text-sm w-full justify-center shadow-[0_0_15px_rgba(45,212,191,0.2)]">
            <Clock className="w-4 h-4" />
            Reconstruct State at Timestamp
          </button>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-0">
        {events.map((event, i) => {
          const config = EVENT_CONFIG[event.event_type] || {
            icon: <GitBranch className="w-3.5 h-3.5" />,
            color: 'bg-surface-500',
            label: event.event_type,
          };
          const dimmed = showRewind && i > sliderIdx;

          return (
            <div
              key={event.id}
              className={`flex gap-4 transition-all duration-300 ${
                dimmed ? 'opacity-40 grayscale-[50%]' : ''
              }`}
            >
              {/* Timeline column */}
              <div className="flex flex-col items-center">
                <div className={`timeline-dot border-4 ${
                  dimmed ? 'border-danger-500/50 bg-danger-500/20' : `border-surface-900 ${config.color}`
                }`}>
                </div>
                {i < events.length - 1 && (
                  <div className={`w-0.5 h-16 ${
                    dimmed ? 'bg-danger-500/30' : 'bg-surface-700'
                  }`} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-4 -mt-1">
                <div className="flex items-center gap-2">
                  <span className={`${dimmed ? 'bg-danger-500/20 text-danger-400' : config.color + ' text-white'} p-1.5 rounded-lg shadow-sm`}>
                    {config.icon}
                  </span>
                  <span className={`text-sm font-semibold ${dimmed ? 'text-danger-400 line-through' : 'text-surface-100'}`}>
                    {config.label}
                  </span>
                  <span className="text-[11px] text-surface-500 uppercase tracking-wider font-mono">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className={`mt-2 text-xs font-mono truncate max-w-md p-2 rounded-md ${
                  dimmed ? 'bg-danger-950/30 text-danger-500/50' : 'bg-surface-900/50 text-surface-400'
                }`}>
                  <Hash className="w-3 h-3 inline mr-1 opacity-50" />
                  {event.event_hash.slice(0, 16)}...
                  {event.source_file && (
                    <span className="ml-2 opacity-70">
                      [{event.source_file}:{event.source_line}]
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
