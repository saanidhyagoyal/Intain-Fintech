import type { LoanState } from '../types';

interface TableProps {
  loans: LoanState[];
  onRowClick?: (loanId: string) => void;
  compact?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  CURRENT: 'badge-resolved', // Reusing CSS classes for consistency
  PAID_OFF: 'badge-resolved',
  LATE: 'badge-open',
  DELINQUENT: 'badge-critical',
  DEFAULT: 'badge-critical',
  CHARGED_OFF: 'badge-critical',
};

export default function Table({ loans, onRowClick, compact = false }: TableProps) {
  const formatCurrency = (val: number | null) =>
    val != null ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—';

  const formatRate = (val: number | null) =>
    val != null ? `${val.toFixed(2)}%` : '—';

  return (
    <div className="w-full overflow-hidden rounded-xl border border-surface-700/60 bg-surface-900/40 shadow-inner">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-32">Loan ID</th>
              <th>Borrower</th>
              {!compact && <th>Type</th>}
              <th className="text-right">Balance</th>
              <th className="text-right">Rate</th>
              <th className="text-center">Status</th>
              {!compact && <th>State</th>}
              <th className="text-center">Events</th>
              <th className="text-center">Verification</th>
            </tr>
          </thead>
          <tbody>
            {loans.length === 0 ? (
              <tr>
                <td colSpan={compact ? 6 : 8} className="text-center text-surface-500 py-12">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <span className="text-xl">📊</span>
                    <span>No loans found. Upload a CSV to get started.</span>
                  </div>
                </td>
              </tr>
            ) : (
              loans.map((loan) => (
                <tr
                  key={loan.loan_id}
                  onClick={() => loan.loan_id && onRowClick?.(loan.loan_id)}
                  className={onRowClick ? 'cursor-pointer hover:bg-surface-800/60' : 'hover:bg-surface-800/60'}
                >
                  <td>
                    <span className="font-mono text-brand-400 font-medium text-xs tracking-wider">{loan.loan_id || '—'}</span>
                  </td>
                  <td className="text-surface-200 font-medium text-sm">{loan.borrower_id || '—'}</td>
                  {!compact && <td className="text-surface-400 text-sm">{loan.loan_type || '—'}</td>}
                  <td className="font-mono text-sm text-right text-surface-100">{formatCurrency(loan.current_balance)}</td>
                  <td className="font-mono text-sm text-right text-surface-100">{formatRate(loan.interest_rate)}</td>
                  <td className="text-center">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${
                      STATUS_COLORS[loan.payment_status?.toUpperCase() || ''] || 'text-surface-300'
                    }`}>
                      {loan.payment_status || '—'}
                    </span>
                  </td>
                  {!compact && <td className="text-surface-400 text-sm">{loan.borrower_state || '—'}</td>}
                  <td className="text-center">
                    <span className="text-xs text-surface-400 font-mono bg-surface-800 px-2 py-1 rounded-md">{loan.event_count}</span>
                  </td>
                  <td className="text-center">
                    {loan.is_verified ? (
                      <span className="badge-verified">✓ Verified</span>
                    ) : loan.has_exceptions ? (
                      <span className="badge-open">⚠ Exception</span>
                    ) : (
                      <span className="badge-low bg-surface-800 border-surface-700">Pending</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
