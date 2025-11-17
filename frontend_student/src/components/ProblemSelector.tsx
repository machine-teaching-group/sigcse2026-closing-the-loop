import React from 'react';
import { ProgrammingProblem } from '../types/api';

interface Props {
  problems: ProgrammingProblem[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export function ProblemSelector({ problems, selected, onSelect }: Props) {
  const formatProblemId = (id: string) => id
    .split('_')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">Problem</label>
      <select value={selected || ''} onChange={e=>onSelect(e.target.value)} className="border rounded px-2 h-10 bg-white">
        <option value="" disabled>Select a problem...</option>
        {problems.map(p => (
          <option key={p.problem_id} value={p.problem_id}>{p.name?.trim().length ? p.name : formatProblemId(p.problem_id)}</option>
        ))}
      </select>
    </div>
  );
}
