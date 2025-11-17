import { INotebookTracker } from '@jupyterlab/notebook';
import { Dialog, showDialog } from '@jupyterlab/apputils';
import { IJupyterLabPioneer } from 'jupyterlab-pioneer';
import { requestHint } from './requestHint';
import { requestAPI } from './handler';
import { HintTypeSelectionWidget } from './showHintTypeDialog';
import { HintConsentWidget } from './showConsentDialog';
import { checkInstructorFeedback, createHintHistoryBar } from './createHintHistoryBar';
import { syncBudgetsOnOpen } from './budget';
import { syncHistoryAndMaybeShowRatingBanner } from './historySync';
// User-configurable question definitions
import questionsConfig from '../user_customizable_configs/notebook_questions/questions.json';
const activateHintBot = async (notebookPanel, pioneer) => {
    var _a;
    console.log('[HintBot] Activating extension for notebook:', notebookPanel.title.label);
    const cells = (_a = notebookPanel.content.model) === null || _a === void 0 ? void 0 : _a.cells;
    console.log('[HintBot] Number of cells:', (cells === null || cells === void 0 ? void 0 : cells.length) || 0);
    // Sync hint budgets from backend so counts reflect server state
    await syncBudgetsOnOpen(notebookPanel);
    // Load historic AI hints and instructor feedback per question, update local metadata,
    // and show earliest unrated item in the banner for rating.
    await syncHistoryAndMaybeShowRatingBanner(notebookPanel, pioneer);
    // Check whether this user has ever requested a hint before. If so, do not treat
    // them as 'first time' users and skip the consent dialog on first request.
    // Only query the backend if we don't already have a stored 'firstTimeUsingHintbot' value
    if (notebookPanel.model.getMetadata('firstTimeUsingHintbot') === undefined) {
        try {
            // The server extension proxies this to orchestration and uses VOC_USERID or local_user
            const everResp = await requestAPI('has_ever_requested');
            if (everResp && everResp.ever_requested === true) {
                // If the server reports the student has requested before, mark them as not-first-time
                notebookPanel.model.setMetadata('firstTimeUsingHintbot', false);
            }
            else {
                // Otherwise, mark as first-time (default behavior)
                notebookPanel.model.setMetadata('firstTimeUsingHintbot', true);
            }
        }
        catch (e) {
            // If the check fails, default to showing consent on first request.
            notebookPanel.model.setMetadata('firstTimeUsingHintbot', true);
            console.warn('has_ever_requested check failed', e);
        }
    }
    const handleHintButtonClick = async (cell, cellIndex, hintType, questionId, questionEndGradeId) => {
        if (notebookPanel.model.getMetadata('firstTimeUsingHintbot') === true) {
            const dialogResult = await showDialog({
                body: new HintConsentWidget(),
                buttons: [
                    Dialog.cancelButton({
                        label: 'Cancel',
                        className: 'jp-mod-reject jp-mod-styled'
                    }),
                    Dialog.createButton({
                        label: 'Consent and request hint',
                        className: 'jp-mod-accept jp-mod-styled'
                    })
                ],
                hasClose: false
            });
            if (dialogResult.button.label === 'Cancel') {
                return;
            }
            pioneer.exporters.forEach(exporter => {
                pioneer.publishEvent(notebookPanel, {
                    eventName: 'FirstTimeUsingHintbot',
                    eventTime: Date.now(),
                    eventInfo: {
                        status: dialogResult.button.label
                    }
                }, exporter, false);
            });
            notebookPanel.model.setMetadata('firstTimeUsingHintbot', false);
        }
        requestHint(notebookPanel, pioneer, cell, cellIndex, hintType, questionId, questionEndGradeId);
    };
    const createHintRequestBar = (cell, cellIndex, questionId, questionEndGradeId) => {
        const hintRequestBar = document.createElement('div');
        hintRequestBar.classList.add('hint-request-bar');
        // Text area and info button
        const hintRequestBarLeft = document.createElement('div');
        hintRequestBarLeft.classList.add('hint-request-bar-left');
        const hintRequestBarLeftText = document.createElement('div');
        hintRequestBarLeftText.classList.add('hint-request-bar-left-text');
        // hintRequestBarLeftText.id = cell.getMetadata('nbgrader').grade_id;
        hintRequestBarLeft.appendChild(hintRequestBarLeftText);
        hintRequestBarLeftText.innerText = 'Request Hint';
        const hintRequestBarLeftInfoBtn = document.createElement('button');
        hintRequestBarLeftInfoBtn.classList.add('hint-request-bar-left-info-button');
        hintRequestBarLeftInfoBtn.innerText = ' ? ';
        hintRequestBarLeftInfoBtn.onclick = () => {
            showDialog({
                body: new HintTypeSelectionWidget(),
                buttons: [
                    Dialog.createButton({
                        label: 'Dismiss',
                        className: 'jp-Dialog-button jp-mod-reject jp-mod-styled'
                    })
                ]
            });
            pioneer.exporters.forEach(exporter => {
                pioneer.publishEvent(notebookPanel, {
                    eventName: 'HintTypeReview',
                    eventTime: Date.now()
                }, exporter, false);
            });
        };
        hintRequestBarLeft.appendChild(hintRequestBarLeftInfoBtn);
        // Planning, Debugging, Optimizing
        const hintRequestBarRight = document.createElement('div');
        // Use the canonical question id as the DOM id so other code can find the bar
        hintRequestBarRight.id = questionId;
        hintRequestBarRight.classList.add('hint-request-bar-right');
        const planning = document.createElement('button');
        // planning.innerText = 'Planning';
        planning.classList.add('hint-request-bar-right-request-button', 'planning');
        planning.onclick = () => handleHintButtonClick(cell, cellIndex, 'planning', questionId, questionEndGradeId);
        const debugging = document.createElement('button');
        // debugging.innerText = 'Debugging';
        debugging.classList.add('hint-request-bar-right-request-button', 'debugging');
        debugging.onclick = () => handleHintButtonClick(cell, cellIndex, 'debugging', questionId, questionEndGradeId);
        const optimizing = document.createElement('button');
        // optimizing.innerText = 'Optimizing';
        optimizing.classList.add('hint-request-bar-right-request-button', 'optimizing');
        optimizing.onclick = () => handleHintButtonClick(cell, cellIndex, 'optimizing', questionId, questionEndGradeId);
        if (cell.getMetadata('remaining_hints') === undefined) {
            cell.setMetadata('remaining_hints', {
                planning: 0,
                debugging: 0,
                optimizing: 0
            });
            planning.innerHTML = `Planning hint (<span class='hint-quantity'>0</span> left)`;
            debugging.innerHTML = `Debugging hint (<span class='hint-quantity'>0</span> left)`;
            optimizing.innerHTML = `Optimizing hint (<span class='hint-quantity'>0</span> left)`;
        }
        else {
            const remainingHints = cell.getMetadata('remaining_hints');
            planning.innerHTML = `Planning hint (<span class='hint-quantity'>${remainingHints.planning}</span> left)`;
            debugging.innerHTML = `Debugging hint (<span class='hint-quantity'>${remainingHints.debugging}</span> left)`;
            optimizing.innerHTML = `Optimizing hint (<span class='hint-quantity'>${remainingHints.optimizing}</span> left)`;
        }
        hintRequestBarRight.appendChild(planning);
        hintRequestBarRight.appendChild(debugging);
        hintRequestBarRight.appendChild(optimizing);
        hintRequestBar.appendChild(hintRequestBarLeft);
        hintRequestBar.appendChild(hintRequestBarRight);
        return hintRequestBar;
    };
    if (cells) {
        // Build lookup from config: start_grade_id -> { question_id, question_end_grade_id }
        const questionByStart = {};
        console.log('[HintBot] Loading questions config:', questionsConfig);
        questionsConfig.forEach(q => {
            if (q && q.question_start_grade_id && q.question_id && q.question_end_grade_id) {
                questionByStart[q.question_start_grade_id] = {
                    question_id: q.question_id,
                    question_end_grade_id: q.question_end_grade_id
                };
            }
        });
        console.log('[HintBot] Question lookup built:', questionByStart);
        let questionIndex = 1;
        for (let i = 0; i < cells.length; i++) {
            const theCell = cells.get(i);
            const nbgrader = theCell.getMetadata('nbgrader');
            const gradeId = nbgrader === null || nbgrader === void 0 ? void 0 : nbgrader.grade_id;
            // Log every cell with nbgrader metadata
            if (gradeId) {
                console.log(`[HintBot] Cell ${i} has grade_id: ${gradeId}`);
            }
            // Recognize question start cell:
            // - If user config provided: match gradeId to a configured question_start_grade_id
            const configured = gradeId ? questionByStart[gradeId] : undefined;
            const isStartByConfig = !!configured;
            if (isStartByConfig) {
                console.log(`[HintBot] ✓ Matched cell ${i} (grade_id: ${gradeId}) as question start`);
                cells.get(i).setMetadata('questionIndex', questionIndex);
                questionIndex += 1;
                // If using fallback, derive defaults: question_id = gradeId; end = `${gradeId}_assert`
                const qId = configured.question_id;
                const qEnd = configured.question_end_grade_id;
                const hintRequestBar = createHintRequestBar(cells.get(i), i, qId, qEnd);
                notebookPanel.content.widgets[i].node.appendChild(hintRequestBar);
                console.log(`[HintBot] ✓ Hint bar added for question ${qId} at cell ${i}`);
                await checkInstructorFeedback(cells.get(i), notebookPanel, pioneer);
                await createHintHistoryBar(cells.get(i), i, notebookPanel, pioneer);
                // Removed periodic 5-minute instructor feedback polling to avoid background checks.
            }
        }
        console.log('[HintBot] Activation complete. Total questions found:', questionIndex - 1);
    }
};
const plugin = {
    id: 'hintbot:plugin',
    description: 'A JupyterLab extension.',
    autoStart: true,
    requires: [INotebookTracker, IJupyterLabPioneer],
    activate: async (app, notebookTracker, pioneer) => {
        console.log('[HintBot] Plugin activated');
        notebookTracker.widgetAdded.connect(async (_, notebookPanel) => {
            console.log('[HintBot] Notebook widget added, waiting for reveal...');
            await notebookPanel.revealed;
            console.log('[HintBot] Notebook revealed, loading exporters...');
            await pioneer.loadExporters(notebookPanel);
            console.log('[HintBot] Exporters loaded, activating hintbot...');
            await activateHintBot(notebookPanel, pioneer);
        });
    }
};
export default plugin;
