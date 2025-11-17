import { requestAPI } from './handler';
import { createHintBanner } from './createHintBanner';
// User-configurable question definitions
import questionsConfig from '../user_customizable_configs/notebook_questions/questions.json';
async function fetchAllForProblem(problem_id) {
    const [ai, fb] = await Promise.all([
        requestAPI(`query_all_hint?problem_id=${encodeURIComponent(problem_id)}`),
        requestAPI(`query_all_feedback?problem_id=${encodeURIComponent(problem_id)}`),
    ]);
    const aiItems = (ai || []).map((a) => {
        var _a;
        return ({
            id: a.request_id || a.id,
            ai_request_id: a.request_id || a.id,
            type: 'ai',
            subtype: (a.hint_type || a.type),
            created_at: a.returned_time || a.created_at || new Date().toISOString(),
            content: a.returned_hint || a.hint || '',
            helpful: (_a = (a.is_hint_helpful !== undefined ? a.is_hint_helpful : a.helpful)) !== null && _a !== void 0 ? _a : null,
        });
    });
    const fbItems = (fb || []).map((f) => {
        var _a;
        return ({
            id: f.instructor_request_id || f.id,
            ai_request_id: f.ai_hint_request_id || undefined,
            type: 'instructor',
            created_at: f.created_at || new Date().toISOString(),
            content: f.instructor_feedback || f.feedback || '',
            instructor_helpful: (_a = (f.is_feedback_helpful !== undefined ? f.is_feedback_helpful : f.helpful)) !== null && _a !== void 0 ? _a : null,
        });
    });
    return [...aiItems, ...fbItems];
}
function pickEarliestUnrated(items) {
    const unrated = items
        .filter((it) => it.type === 'ai' ? (it.helpful === null || it.helpful === undefined) : (it.instructor_helpful === null || it.instructor_helpful === undefined))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return unrated.length ? unrated[0] : null;
}
export async function syncHistoryAndMaybeShowRatingBanner(notebookPanel, pioneer) {
    var _a, _b;
    const cells = (_a = notebookPanel.content.model) === null || _a === void 0 ? void 0 : _a.cells;
    if (!cells)
        return;
    // Iterate question cells
    for (let i = 0; i < cells.length; i++) {
        const c = cells.get(i);
        const nb = c.getMetadata('nbgrader');
        if (!(nb && (nb === null || nb === void 0 ? void 0 : nb.grade_id)))
            continue;
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
        const configured = questionByStart[nb.grade_id];
        // If this start cell is not configured in questions.json, skip fetching history.
        if (!configured)
            continue;
        const problem_id = configured.question_id;
        const items = await fetchAllForProblem(problem_id);
        // Update local hintHistory metadata to mirror fetched items, mapping to jx structure
        const hintHistory = items.map((it) => {
            var _a;
            return ({
                // For AI items, requestId is the AI request id. For instructor feedback,
                // use the corresponding AI request id as requestId (per requirement). Keep
                // the original instructor feedback id in instructorRequestId so we can
                // save ratings against it later.
                requestId: it.type === 'ai' ? it.id : ((_a = it.ai_request_id) !== null && _a !== void 0 ? _a : it.id),
                instructorRequestId: it.type === 'instructor' ? it.id : undefined,
                isGPT: it.type === 'ai',
                hintType: it.type === 'ai' ? (it.subtype || 'plan') : (it.subtype || 'debug'),
                hintContent: it.content || 0,
                // Store rating flags in parallel fields so we can check later if unrated
                helpful: it.helpful,
                instructor_helpful: it.instructor_helpful,
            });
        });
        c.setMetadata('hintHistory', hintHistory);
        // If there is an unrated item, show the banner with that content for rating
        const earliest = pickEarliestUnrated(items);
        if (earliest && !document.getElementById('hint-banner')) {
            if (earliest.type === 'ai') {
                const hintType = (earliest.subtype === 'plan' ? 'planning' : earliest.subtype === 'debug' ? 'debugging' : 'optimizing');
                await createHintBanner(notebookPanel, pioneer, c, i, 'promptA', '', '', '', hintType, String(earliest.id), { preloadedContent: earliest.content, skipNetwork: true });
            }
            else {
                // Instructor feedback banner with rating only
                const banner = document.createElement('div');
                banner.id = 'hint-banner';
                c && ((_b = notebookPanel.content.node.parentElement) === null || _b === void 0 ? void 0 : _b.insertBefore(banner, notebookPanel.content.node));
                // Mark banner active to allow global UI styling (disable hint buttons)
                try {
                    (await import('./bannerActive')).setBannerActive(true);
                }
                catch (_c) { }
                banner.innerHTML = '';
                // Title row
                const titleRow = document.createElement('div');
                titleRow.id = 'hint-banner-title-row';
                const titleDiv = document.createElement('div');
                titleDiv.classList.add('hint-banner-title');
                titleDiv.textContent = 'Instructor Feedback';
                titleRow.appendChild(titleDiv);
                banner.appendChild(titleRow);
                const content = document.createElement('div');
                content.id = 'hint-banner-content';
                const p = document.createElement('p');
                p.textContent = earliest.content;
                content.appendChild(p);
                banner.appendChild(content);
                const buttonsContainer = document.createElement('div');
                buttonsContainer.id = 'hint-banner-buttons-container';
                const buttons = document.createElement('div');
                buttons.id = 'hint-banner-buttons';
                const helpful = document.createElement('button');
                helpful.classList.add('hint-banner-button', 'hint-button-helpful');
                helpful.innerText = '👍 Helpful';
                const unhelpful = document.createElement('button');
                unhelpful.classList.add('hint-banner-button', 'hint-button-unhelpful');
                unhelpful.innerText = '👎 Unhelpful';
                buttons.appendChild(unhelpful);
                buttons.appendChild(helpful);
                buttonsContainer.appendChild(buttons);
                banner.appendChild(buttonsContainer);
                const saveFeedbackRating = async (val) => {
                    // Return the request promise so callers can observe success/failure
                    return requestAPI('save_feedback_rating', { method: 'POST', body: JSON.stringify({ instructor_request_id: earliest.id, is_feedback_helpful: val }) });
                };
                const refreshHistoryBar = async () => {
                    var _a;
                    console.debug('[hint] refreshHistoryBar - earliest.id=', earliest.id);
                    const meta = c.getMetadata('hintHistory') || [];
                    // Find the metadata entry by original instructor feedback id stored in instructorRequestId
                    const idx = meta.findIndex((m) => String(m.instructorRequestId) === String(earliest.id));
                    console.debug('[hint] refreshHistoryBar - found idx=', idx, 'meta-before=', meta);
                    if (idx >= 0) {
                        // Ensure the field exists (null placeholder) so the history renderer can pick it up
                        meta[idx].instructor_helpful = (_a = meta[idx].instructor_helpful) !== null && _a !== void 0 ? _a : null;
                        c.setMetadata('hintHistory', meta);
                        try {
                            // Persist metadata so consumers that read from disk see the change
                            await notebookPanel.context.save();
                        }
                        catch (e) {
                            console.warn('[hint] refreshHistoryBar - notebook save failed', e);
                        }
                        console.debug('[hint] refreshHistoryBar - meta-after=', meta);
                    }
                    try {
                        const mod = await import('./createHintHistoryBar');
                        await mod.createHintHistoryBar(c, i, notebookPanel, pioneer);
                    }
                    catch (e) {
                        console.warn('[hint] refreshHistoryBar - createHintHistoryBar failed', e);
                    }
                };
                helpful.onclick = async () => {
                    console.debug('[hint] helpful.onclick - earliest.id=', earliest.id);
                    try {
                        try {
                            await saveFeedbackRating(true);
                            console.debug('[hint] saveFeedbackRating(true) succeeded for', earliest.id);
                        }
                        catch (e) {
                            console.error('[hint] saveFeedbackRating(true) failed', e);
                        }
                        const meta = c.getMetadata('hintHistory') || [];
                        // instructor feedback entries store their original instructor id in instructorRequestId
                        const idx = meta.findIndex((m) => String(m.instructorRequestId) === String(earliest.id));
                        console.debug('[hint] helpful.onclick - found idx=', idx, 'meta-before=', meta);
                        if (idx >= 0) {
                            meta[idx].instructor_helpful = true;
                            c.setMetadata('hintHistory', meta);
                        }
                        await refreshHistoryBar();
                    }
                    finally {
                        try {
                            (await import('./bannerActive')).setBannerActive(false);
                        }
                        catch (_a) { }
                        banner.remove();
                    }
                };
                unhelpful.onclick = async () => {
                    console.debug('[hint] unhelpful.onclick - earliest.id=', earliest.id);
                    try {
                        try {
                            await saveFeedbackRating(false);
                            console.debug('[hint] saveFeedbackRating(false) succeeded for', earliest.id);
                        }
                        catch (e) {
                            console.error('[hint] saveFeedbackRating(false) failed', e);
                        }
                        const meta = c.getMetadata('hintHistory') || [];
                        const idx = meta.findIndex((m) => String(m.instructorRequestId) === String(earliest.id));
                        console.debug('[hint] unhelpful.onclick - found idx=', idx, 'meta-before=', meta);
                        if (idx >= 0) {
                            meta[idx].instructor_helpful = false;
                            c.setMetadata('hintHistory', meta);
                        }
                        await refreshHistoryBar();
                    }
                    finally {
                        try {
                            (await import('./bannerActive')).setBannerActive(false);
                        }
                        catch (_a) { }
                        banner.remove();
                    }
                };
            }
        }
    }
}
