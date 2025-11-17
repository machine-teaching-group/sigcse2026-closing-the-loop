import { requestAPI } from './handler';
// User-configurable question definitions
import questionsConfig from '../user_customizable_configs/notebook_questions/questions.json';
// Map server keys to local hint types
function toNumberOrNull(v) {
    return v === null || v === undefined ? null : Number(v);
}
function mapServerToLocal(left) {
    return {
        planning: toNumberOrNull(left.plan),
        debugging: toNumberOrNull(left.debug),
        optimizing: toNumberOrNull(left.optimize)
    };
}
async function fetchQuotaForProblem(problem_id) {
    try {
        const data = await requestAPI(`quota_left?problem_id=${encodeURIComponent(problem_id)}`, {
            method: 'GET'
        });
        return data;
    }
    catch (e) {
        console.warn('Failed to fetch quota_left for', problem_id, e);
        return null;
    }
}
export async function syncBudgetsOnOpen(notebookPanel) {
    var _a, _b, _c, _d;
    const cells = (_a = notebookPanel.content.model) === null || _a === void 0 ? void 0 : _a.cells;
    if (!cells)
        return;
    // Build lookup from config: start_grade_id -> question_id
    const questionByStart = {};
    questionsConfig.forEach((q) => {
        if (q && q.question_start_grade_id && q.question_id && q.question_end_grade_id) {
            questionByStart[q.question_start_grade_id] = {
                question_id: q.question_id,
                question_end_grade_id: q.question_end_grade_id,
            };
        }
    });
    // Gather question cells and their problem ids (only config entries)
    const questionCells = [];
    for (let i = 0; i < cells.length; i++) {
        const c = cells.get(i);
        const nb = c.getMetadata('nbgrader');
        if (!(nb && (nb === null || nb === void 0 ? void 0 : nb.grade_id)))
            continue;
        const configured = questionByStart[nb.grade_id];
        if (configured) {
            questionCells.push({ cell: c, idx: i, problem_id: configured.question_id });
        }
        // If no config entry, ignore the cell (no fallback)
    }
    // Fetch quotas for each problem_id (sequential to be gentle; could batch if backend supports)
    for (const qc of questionCells) {
        const quota = await fetchQuotaForProblem(qc.problem_id);
        if (!quota)
            continue;
        const mapped = mapServerToLocal(quota.left);
        // Update metadata only for numeric values; keep existing for unlimited (null)
        const current = qc.cell.getMetadata('remaining_hints') || {};
        const next = {
            planning: typeof mapped.planning === 'number' ? mapped.planning : (_b = current.planning) !== null && _b !== void 0 ? _b : 1,
            debugging: typeof mapped.debugging === 'number' ? mapped.debugging : (_c = current.debugging) !== null && _c !== void 0 ? _c : 3,
            optimizing: typeof mapped.optimizing === 'number' ? mapped.optimizing : (_d = current.optimizing) !== null && _d !== void 0 ? _d : 1,
        };
        qc.cell.setMetadata('remaining_hints', next);
        // update UI using canonical problem_id (question_id). The hint bar DOM id is now the question id.
        updateButtonsCount(qc.problem_id, next);
    }
    try {
        await notebookPanel.context.save();
    }
    catch ( /* ignore */_e) { /* ignore */ }
}
function updateButtonsCount(problem_id, counts) {
    const container = document.getElementById(problem_id);
    if (!container)
        return;
    const setCount = (cls, val) => {
        const btn = container.querySelector(`.${cls}`);
        const span = btn === null || btn === void 0 ? void 0 : btn.querySelector('.hint-quantity');
        if (span)
            span.textContent = String(val !== null && val !== void 0 ? val : '');
    };
    if (typeof counts.planning === 'number')
        setCount('planning', counts.planning);
    if (typeof counts.debugging === 'number')
        setCount('debugging', counts.debugging);
    if (typeof counts.optimizing === 'number')
        setCount('optimizing', counts.optimizing);
}
