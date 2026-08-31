import React from 'react';

const FinTechBackground = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-slate-950">
      {/* Deep Institutional Gradient Base */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-[#0a0f25] to-slate-950" />
      
      {/* Animated Glowing Orbs (Simulating AI/Ledger Nodes) */}
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-teal-900/30 rounded-full blur-[120px] animate-orb-drift-1" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-brand-900/20 rounded-full blur-[150px] animate-orb-drift-2" style={{ animationDelay: '2s' }} />
      <div className="absolute top-[20%] right-[20%] w-[40%] h-[40%] bg-cyan-900/20 rounded-full blur-[100px] animate-orb-drift-3" style={{ animationDelay: '4s' }} />

      {/* SVG Cryptographic Grid Pattern */}
      <div className="absolute inset-0 opacity-20 animate-grid-fade">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="crypto-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-teal-500/30" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#crypto-grid)" />
        </svg>
      </div>

      {/* Vignette Overlay for Depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent to-slate-950 opacity-80" />
    </div>
  );
};

export default FinTechBackground;
