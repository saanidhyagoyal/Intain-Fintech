import { useState, useCallback } from 'react';
import { Upload, X, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../api/client';
import type { IngestionResult } from '../types';

interface UploadZoneProps {
  onUploadComplete?: (result: IngestionResult) => void;
}

export default function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState('loan_tape');

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true);
    else if (e.type === 'dragleave') setIsDragging(false);
  }, []);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setResult(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(`/ingest/upload?source_type=${sourceType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      onUploadComplete?.(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) uploadFile(files[0]);
  }, [sourceType]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) uploadFile(files[0]);
  };

  return (
    <div className="space-y-4">
      {/* Source type selector */}
      <div className="flex gap-2">
        {[
          { value: 'loan_tape', label: 'Loan Tape', icon: '📋' },
          { value: 'servicer_update', label: 'Servicer Update', icon: '🔄' },
          { value: 'document_manifest', label: 'Document Manifest', icon: '📄' },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setSourceType(t.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              sourceType === t.value
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 cursor-pointer ${
          isDragging
            ? 'border-brand-400 bg-brand-500/10 scale-[1.02]'
            : 'border-surface-600/50 hover:border-brand-500/50 hover:bg-surface-800/30'
        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={uploading}
        />

        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <>
              <div className="w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
              <p className="text-surface-300 font-medium">Processing CSV file...</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
                <Upload className="w-8 h-8 text-brand-400" />
              </div>
              <div>
                <p className="text-surface-200 font-semibold text-lg">
                  Drop your CSV file here
                </p>
                <p className="text-surface-400 text-sm mt-1">
                  or click to browse • Supports {sourceType.replace('_', ' ')} format
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="glass-card p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-success-400" />
              <span className="font-semibold text-success-400">Upload Complete</span>
            </div>
            <button onClick={() => setResult(null)} className="text-surface-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-brand-400">{result.total_rows}</div>
              <div className="text-xs text-surface-400">Total Rows</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success-400">{result.imported_count}</div>
              <div className="text-xs text-surface-400">Imported</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-danger-400">{result.failed_count}</div>
              <div className="text-xs text-surface-400">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning-400">{result.validation_exceptions}</div>
              <div className="text-xs text-surface-400">Exceptions</div>
            </div>
          </div>

          {result.conflicts_detected > 0 && (
            <div className="mt-3 flex items-center gap-2 text-warning-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              {result.conflicts_detected} conflict(s) detected with existing data
            </div>
          )}

          {result.failed_rows.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm text-surface-400 cursor-pointer hover:text-surface-200">
                View {result.failed_rows.length} failed row(s)
              </summary>
              <div className="mt-2 max-h-40 overflow-y-auto bg-surface-900/50 rounded-xl p-3">
                {result.failed_rows.map((row, i) => (
                  <div key={i} className="text-xs text-danger-400 font-mono mb-1">
                    Line {String(row.line)}: {String(row.reason)}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="glass-card p-4 border-danger-500/30 animate-slide-up">
          <div className="flex items-center gap-2 text-danger-400">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
