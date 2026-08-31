import { useEffect, useState } from 'react';
import { Book, CheckCircle, XCircle, Plus, Sparkles, Filter, Code, ShieldAlert, Cpu, X, Terminal } from 'lucide-react';
import api from '../api/client';
import type { ValidationRule } from '../types';

export default function RulesDictionaryDash() {
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [compiledRule, setCompiledRule] = useState<Record<string, any> | null>(null);
  const [compileModel, setCompileModel] = useState('');
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchRules = async () => {
    try {
      const res = await api.get('/rules');
      setRules(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleApprove = async (id: number) => {
    try {
      await api.patch(`/rules/${id}/approve`);
      await fetchRules();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await api.patch(`/rules/${id}/reject`);
      await fetchRules();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCompile = async () => {
    if (!prompt.trim()) return;
    setCompiling(true);
    setCompiledRule(null);
    setSecurityError(null);
    setCompileModel('');

    try {
      const res = await api.post('/rules/compile', { prompt: prompt.trim() });
      setCompiledRule(res.data.compiled_rule);
      setCompileModel(res.data.model_name);
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Unknown compilation error.';
      setSecurityError(detail);
    }
    setCompiling(false);
  };

  const handleSaveRule = async () => {
    if (!compiledRule) return;
    setSaving(true);
    try {
      await api.post('/rules', { logic_payload: compiledRule });
      setIsModalOpen(false);
      setPrompt('');
      setCompiledRule(null);
      setSecurityError(null);
      await fetchRules();
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const resetModal = () => {
    setIsModalOpen(false);
    setPrompt('');
    setCompiledRule(null);
    setSecurityError(null);
    setCompileModel('');
  };

  if (loading) {
    return (
      <div className="space-y-6 p-8">
        <div className="skeleton h-8 w-1/3" />
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    );
  }

  const pendingRules = rules.filter(r => r.status === 'PENDING');
  const activeRules = rules.filter(r => r.status === 'ACTIVE');

  const parseLogicPayload = (r: ValidationRule) => {
    if (r.logic_payload) {
      try { return JSON.parse(r.logic_payload); } catch { return null; }
    }
    return null;
  };

  const renderRuleSummary = (r: ValidationRule) => {
    const logic = parseLogicPayload(r);
    if (logic) {
      return (
        <div className="text-surface-300 text-sm font-mono mt-2 bg-surface-900 p-3 rounded-lg border border-surface-700/50">
          <span className="text-info-400">IF</span>{' '}
          <span className="text-brand-400">{logic.field}</span>{' '}
          <span className="text-surface-400">{logic.operator}</span>{' '}
          <span className="text-danger-400">{JSON.stringify(logic.target_value)}</span>
          <br />
          <span className="text-info-400">THEN</span>{' '}
          <span className="text-success-400">{logic.action}</span>{' '}
          {logic.action_value != null && <span className="text-warning-400">→ {JSON.stringify(logic.action_value)}</span>}
        </div>
      );
    }
    // Legacy format
    return (
      <div className="text-surface-300 text-sm font-mono mt-2 bg-surface-900 p-3 rounded-lg border border-surface-700/50">
        IF input matches: <span className="text-danger-400">{JSON.parse(r.condition_json || '{}')?.equals || r.condition_json}</span>
        <br />
        THEN map to: <span className="text-success-400">{JSON.stringify(JSON.parse(r.transformation_json || '{}')?.map || {})}</span>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100 flex items-center gap-2">
            <Book className="w-6 h-6 text-brand-400" />
            Rules Dictionary (HITL)
          </h1>
          <p className="text-surface-400 mt-1">Manage AI-suggested mappings and define rules using natural language</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center gap-2 shadow-[0_0_15px_rgba(45,212,191,0.2)]"
        >
          <Plus className="w-4 h-4" />
          Create New Rule
        </button>
      </div>

      {/* Pending Suggestions Tab */}
      <div className="glass-card">
        <div className="p-6 border-b border-surface-700/50 bg-surface-800/30 flex items-center gap-3">
          <div className="p-2 bg-brand-500/10 rounded-lg">
            <Sparkles className="w-5 h-5 text-brand-400" />
          </div>
          <h2 className="text-lg font-semibold text-surface-100">Pending AI Suggestions ({pendingRules.length})</h2>
        </div>
        
        <div className="p-6">
          {pendingRules.length === 0 ? (
            <div className="text-center py-8 text-surface-400 bg-surface-800/30 rounded-xl border border-dashed border-surface-700">
              No pending AI rules. The system is learning from maker activity.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRules.map(rule => (
                <div key={rule.id} className="bg-surface-800/50 border border-surface-700 rounded-xl p-5 flex items-center justify-between transition-all hover:bg-surface-800">
                  <div className="flex items-start gap-4">
                    <div className="pt-1">
                      <Code className="w-5 h-5 text-surface-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">
                          {rule.field_name}
                        </span>
                        <span className="text-surface-400 text-sm">synthesized rule</span>
                      </div>
                      {renderRuleSummary(rule)}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4 shrink-0">
                    <button 
                      onClick={() => handleApprove(rule.id)}
                      className="px-4 py-2 bg-success-500/10 text-success-400 hover:bg-success-500/20 border border-success-500/20 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button 
                      onClick={() => handleReject(rule.id)}
                      className="px-4 py-2 bg-danger-500/10 text-danger-400 hover:bg-danger-500/20 border border-danger-500/20 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active Rules Dictionary */}
      <div className="glass-card">
        <div className="p-6 border-b border-surface-700/50 bg-surface-800/30 flex items-center gap-3">
          <div className="p-2 bg-success-500/10 rounded-lg">
            <Filter className="w-5 h-5 text-success-400" />
          </div>
          <h2 className="text-lg font-semibold text-surface-100">Active Rule Dictionary ({activeRules.length})</h2>
        </div>
        
        <div className="p-6">
          {activeRules.length === 0 ? (
            <div className="text-center py-8 text-surface-400 bg-surface-800/30 rounded-xl border border-dashed border-surface-700">
              No active dynamic rules. Create one using the button above.
            </div>
          ) : (
            <div className="space-y-4">
              {activeRules.map(rule => (
                <div key={rule.id} className="bg-surface-800/30 border border-surface-700/50 rounded-xl p-5 transition-all hover:bg-surface-800/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Terminal className="w-4 h-4 text-success-400" />
                      <span className="text-surface-200 font-medium text-sm">{rule.rule_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rule.source === 'MANUAL' ? 'bg-info-500/10 text-info-400 border border-info-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      }`}>
                        {rule.source}
                      </span>
                      <span className="bg-success-500/10 text-success-400 px-2 py-0.5 rounded text-xs font-medium border border-success-500/20">
                        ACTIVE
                      </span>
                    </div>
                  </div>
                  {renderRuleSummary(rule)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── AI Rule Compiler Modal ──────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 backdrop-blur-sm bg-black/60" onClick={resetModal} />
          <div className="relative glass-card w-full max-w-lg p-8 shadow-2xl border border-surface-600/50 rounded-2xl animate-slide-up">
            {/* Close */}
            <button onClick={resetModal} className="absolute top-4 right-4 text-surface-500 hover:text-surface-200 transition-colors">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-surface-100 mb-2 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-brand-400" />
              AI Rule Compiler
            </h3>
            <p className="text-xs text-surface-500 mb-6">
              Describe a validation rule in plain English. The AI will compile it into structured logic for verification.
            </p>

            {/* Prompt Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-surface-300 mb-2">
                Describe the validation rule in plain English
              </label>
              <textarea
                value={prompt}
                onChange={e => {
                  if (e.target.value.length <= 250) {
                    setPrompt(e.target.value);
                    setSecurityError(null);
                    setCompiledRule(null);
                  }
                }}
                placeholder='e.g. "If the interest rate is greater than 100, flag it for review"'
                rows={3}
                className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100 focus:outline-none focus:border-brand-500 text-sm resize-none placeholder:text-surface-600"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-surface-600 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  Prompt injection guardrails active
                </span>
                <span className={`text-[10px] ${prompt.length > 220 ? 'text-warning-400' : 'text-surface-600'}`}>
                  {prompt.length}/250
                </span>
              </div>
            </div>

            {/* Compile Button */}
            {!compiledRule && (
              <button
                onClick={handleCompile}
                disabled={!prompt.trim() || compiling}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3"
              >
                {compiling ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Compiling with AI...
                  </>
                ) : (
                  <>
                    <Cpu className="w-4 h-4" />
                    Compile Rule with AI
                  </>
                )}
              </button>
            )}

            {/* Security Violation Banner */}
            {securityError && (
              <div className="mt-4 bg-danger-500/10 border border-danger-500/30 rounded-xl p-4 flex items-start gap-3 animate-slide-up">
                <ShieldAlert className="w-5 h-5 text-danger-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-danger-400">Security Violation</div>
                  <div className="text-xs text-danger-400/80 mt-1">{securityError}</div>
                </div>
              </div>
            )}

            {/* Compiled Rule Output */}
            {compiledRule && (
              <div className="mt-4 space-y-4 animate-slide-up">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-success-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Compilation Successful
                    </span>
                    <span className="text-[10px] text-surface-600 font-mono">{compileModel}</span>
                  </div>
                  <pre className="bg-surface-900 border border-surface-700 rounded-xl p-4 text-xs font-mono text-surface-200 overflow-auto leading-relaxed">
                    {JSON.stringify(compiledRule, null, 2)}
                  </pre>
                </div>

                {/* Visual Rule Preview */}
                <div className="bg-surface-800/50 border border-surface-700/50 rounded-xl p-4">
                  <div className="text-xs text-surface-500 mb-2 uppercase tracking-wider font-bold">Rule Preview</div>
                  <div className="text-sm font-mono text-surface-200">
                    <span className="text-info-400">IF</span>{' '}
                    <span className="text-brand-400">{compiledRule.field}</span>{' '}
                    <span className="text-surface-400">{compiledRule.operator}</span>{' '}
                    <span className="text-danger-400">{JSON.stringify(compiledRule.target_value)}</span>
                    <br />
                    <span className="text-info-400">THEN</span>{' '}
                    <span className="text-success-400">{compiledRule.action}</span>{' '}
                    {compiledRule.action_value != null && (
                      <span className="text-warning-400">→ {JSON.stringify(compiledRule.action_value)}</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleSaveRule}
                  disabled={saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3"
                >
                  {saving ? 'Saving...' : 'Save Active Rule'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
