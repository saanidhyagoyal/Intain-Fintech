import type { ReactNode } from 'react';

interface StatsCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: string;
  color?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
  delay?: number;
}

const colorMap = {
  brand: 'from-brand-500/20 to-brand-600/10 text-brand-400',
  success: 'from-success-500/20 to-success-600/10 text-success-400',
  warning: 'from-warning-500/20 to-warning-600/10 text-warning-400',
  danger: 'from-danger-500/20 to-danger-600/10 text-danger-400',
  info: 'from-info-500/20 to-info-600/10 text-info-400',
};

const iconBg = {
  brand: 'bg-brand-500/15',
  success: 'bg-success-500/15',
  warning: 'bg-warning-500/15',
  danger: 'bg-danger-500/15',
  info: 'bg-info-500/15',
};

export default function StatsCard({ icon, label, value, trend, color = 'brand', delay = 0 }: StatsCardProps) {
  return (
    <div
      className={`stat-card bg-gradient-to-br ${colorMap[color]} opacity-0 animate-slide-up`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
    >
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl ${iconBg[color]} flex items-center justify-center`}>
          {icon}
        </div>
        {trend && (
          <span className="text-xs font-medium text-surface-400">{trend}</span>
        )}
      </div>
      <div className="stat-value mt-2">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
