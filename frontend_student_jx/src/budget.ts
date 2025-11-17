import { NotebookPanel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';
import { requestAPI } from './handler';
// User-configurable question definitions
import questionsConfig from '../user_customizable_configs/notebook_questions/questions.json';

export type QuotaLeft = {
  student_id: string;
  problem_id: string;
  limits: { overall: number | null; plan: number | null; debug: number | null; optimize: number | null };
  used: { overall: number; plan: number; debug: number; optimize: number };
  left: { overall: number | null; plan: number | null; debug: number | null; optimize: number | null };
};

// Map server keys to local hint types
function toNumberOrNull(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapServerToLocal(left: QuotaLeft['left']) {
  return {
    planning: toNumberOrNull(left.plan),
    debugging: toNumberOrNull(left.debug),
    optimizing: toNumberOrNull(left.optimize)
  } as { planning: number | null; debugging: number | null; optimizing: number | null };
}

async function fetchQuotaForProblem(problem_id: string): Promise<QuotaLeft | null> {
  try {
    const data = await requestAPI<QuotaLeft>(`quota_left?problem_id=${encodeURIComponent(problem_id)}`, {
      method: 'GET'
    });
    return data;
  } catch (e) {
    console.warn('Failed to fetch quota_left for', problem_id, e);
    return null;
  }
}



export async function syncBudgetsOnOpen(notebookPanel: NotebookPanel) {
  const cells = notebookPanel.content.model?.cells;
  if (!cells) return;

  // Build lookup from config: start_grade_id -> question_id
  const questionByStart: Record<string, { question_id: string; question_end_grade_id: string }> = {};
  (questionsConfig as Array<any>).forEach((q) => {
    if (q && q.question_start_grade_id && q.question_id && q.question_end_grade_id) {
      questionByStart[q.question_start_grade_id] = {
        question_id: q.question_id,
        question_end_grade_id: q.question_end_grade_id,
      };
    }
  });

  // Gather question cells and their problem ids (only config entries)
  const questionCells: Array<{ cell: ICellModel; idx: number; problem_id: string }> = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells.get(i);
    const nb = c.getMetadata('nbgrader');
    if (!(nb && nb?.grade_id)) continue;

    const configured = questionByStart[nb.grade_id];
    if (configured) {
      questionCells.push({ cell: c, idx: i, problem_id: configured.question_id });
    }
    // If no config entry, ignore the cell (no fallback)
  }

  // Fetch quotas for each problem_id (sequential to be gentle; could batch if backend supports)
  for (const qc of questionCells) {
    const quota = await fetchQuotaForProblem(qc.problem_id);
    if (!quota) continue;

    const mapped = mapServerToLocal(quota.left);

    // Update metadata only for numeric values; keep existing for unlimited (null)
    const current = qc.cell.getMetadata('remaining_hints') || {};
    const next = {
      planning: typeof mapped.planning === 'number' ? mapped.planning : current.planning ?? 1,
      debugging: typeof mapped.debugging === 'number' ? mapped.debugging : current.debugging ?? 3,
      optimizing: typeof mapped.optimizing === 'number' ? mapped.optimizing : current.optimizing ?? 1,
    };
    qc.cell.setMetadata('remaining_hints', next);
    // update UI using canonical problem_id (question_id). The hint bar DOM id is now the question id.
    updateButtonsCount(qc.problem_id, next);
  }

  try { await notebookPanel.context.save(); } catch { /* ignore */ }
}

function updateButtonsCount(problem_id: string, counts: { planning: number | null; debugging: number | null; optimizing: number | null }) {
  const container = document.getElementById(problem_id);
  if (!container) return;
  const setCount = (cls: string, val: number | null) => {
    const btn = container.querySelector(`.${cls}`);
    const span = btn?.querySelector('.hint-quantity');
    if (span) span.textContent = String(val ?? '');
  };
  if (typeof counts.planning === 'number') setCount('planning', counts.planning);
  if (typeof counts.debugging === 'number') setCount('debugging', counts.debugging);
  if (typeof counts.optimizing === 'number') setCount('optimizing', counts.optimizing);
}
