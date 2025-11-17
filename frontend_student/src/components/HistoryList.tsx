import React from 'react';
import { HistoricHintItem } from '../types/api';

interface Props {
  items: HistoricHintItem[];
}

export const HistoryList: React.FC<Props> = ({ items }) => {
  const [openIds, setOpenIds] = React.useState<Set<number>>(new Set());
  const toggle = (id: number) => {
    setOpenIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const labelFor = (it: HistoricHintItem): string => {
    if (it.type === 'instructor') return 'Instructor Feedback';
    switch (it.subtype) {
      case 'plan': return 'Planning Hint';
      case 'debug': return 'Debugging Hint';
      case 'optimize': return 'Optimization Hint';
      default: return 'AI Hint';
    }
  };

  const sorted = [...items].sort((a,b)=>{
    const aid = a.ai_request_id ?? a.id;
    const bid = b.ai_request_id ?? b.id;
    if (aid !== bid) return aid - bid;
    if (a.type !== b.type) {
      if (a.type === 'ai' && b.type === 'instructor') return -1;
      if (a.type === 'instructor' && b.type === 'ai') return 1;
    }
    return 0;
  });
  const showEdgeLabels = sorted.length > 1;

  return (
    <div className="space-y-2">
      {sorted.map((item, idx) => {
          const open = openIds.has(item.id);
          const title = labelFor(item);
          const ratedThumb = (() => {
            if (item.type === 'ai') {
              if (item.helpful !== undefined && item.helpful !== null) return item.helpful ? ' 👍 ' : ' 👎 ';
              return null;
            }
            if (item.type === 'instructor') {
              if (item.instructor_helpful !== undefined && item.instructor_helpful !== null) return item.instructor_helpful ? ' 👍 ' : ' 👎 ';
              return null;
            }
            return null;
          })();
          const isEarliest = showEdgeLabels && idx === 0;
          const isLatest = showEdgeLabels && idx === sorted.length - 1;
          return (
            <div key={`${item.type}-${item.id}`} className="border rounded bg-white shadow-sm">
              <button onClick={() => toggle(item.id)} className="w-full flex justify-between items-center px-3 py-2 text-left">
                <span className="text-sm font-medium text-gray-800">
                  {title}
                  {ratedThumb && <span className="mr-1.5" aria-hidden>{ratedThumb}</span>}
                  {isEarliest && <span className="text-gray-400 font-normal ml-2">(earliest)</span>}
                  {isLatest && !isEarliest && <span className="text-gray-400 font-normal ml-2">(latest)</span>}
                </span>
                <span className="text-xs text-gray-500">{open ? 'Hide' : 'Show'}</span>
              </button>
              {open && (
                <div className="border-t px-3 py-2 text-sm whitespace-pre-wrap bg-gray-50">
                  {item.content || <span className="text-gray-400">(no content)</span>}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};
