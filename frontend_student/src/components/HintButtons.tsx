import React from 'react';

interface Props {
  disabled: boolean;
  onRequest: (type: 'plan' | 'debug' | 'optimize') => void;
  loadingType?: string | null;
  planLeft?: number;
  debugLeft?: number;
  optimizeLeft?: number;
  disabledReason?: string | null;
}

const labels: Record<string,string> = { plan: 'Planning Hint', debug: 'Debugging Hint', optimize: 'Optimization Hint' };

export function HintButtons({ disabled, onRequest, loadingType, planLeft, debugLeft, optimizeLeft, disabledReason }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {(['plan','debug','optimize'] as const).map(t => {
        let base = '';
        if (t==='plan') base = 'bg-sky-300 hover:bg-sky-400 disabled:bg-gray-200 text-black-900';
        if (t==='debug') base = 'bg-rose-300 hover:bg-rose-400 disabled:bg-gray-200 text-black-900';
        if (t==='optimize') base = 'bg-green-300 hover:bg-green-400 disabled:bg-gray-200 text-black-900';
    const leftMap: Record<string, number | undefined> = { plan: planLeft, debug: debugLeft, optimize: optimizeLeft } as any;
    const suffix = typeof leftMap[t] === 'number' ? ` (${leftMap[t]} left)` : '';
        return (
          <button
            key={t}
            disabled={disabled || loadingType===t}
            onClick={()=>onRequest(t)}
            className={`w-full px-3 py-1.5 rounded font-medium shadow-sm transition-colors text-sm ${base}`}
            title={(disabled || loadingType===t) && disabledReason ? disabledReason : undefined}
          >
      {loadingType===t ? 'Requesting...' : `${labels[t]}${suffix}`}
          </button>
        );
      })}
    </div>
  );
}
