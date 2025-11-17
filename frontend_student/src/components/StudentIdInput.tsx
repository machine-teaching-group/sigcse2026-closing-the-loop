import React from 'react';
// NOTE: This inline control is now legacy. The app shows an entry screen
// to collect Student ID before rendering the main UI. Kept for potential
// reuse in future flows and to avoid breaking imports.

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function StudentIdInput({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">Student ID</label>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder="Enter your ID" className="border rounded px-2 h-10" />
    </div>
  );
}
