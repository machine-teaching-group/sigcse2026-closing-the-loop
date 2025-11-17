import { Dialog, showDialog } from '@jupyterlab/apputils';
import { v4 as uuidv4 } from 'uuid';
import { showReflectionDialog } from './showReflectionDialog';
import { createHintBanner } from './createHintBanner';
import { requestAPI } from './handler';
export const requestHint = async (notebookPanel, pioneer, cell, cellIndex, hintType, questionId, questionEndGradeId) => {
    var _a, _b, _c;
    const gradeId = (_a = cell.getMetadata('nbgrader')) === null || _a === void 0 ? void 0 : _a.grade_id;
    const remainingHints = cell.getMetadata('remaining_hints');
    if (document.getElementById('hint-banner')) {
        showDialog({
            title: 'Please review previous hint first.',
            buttons: [
                Dialog.createButton({
                    label: 'Dismiss',
                    className: 'jp-Dialog-button jp-mod-reject jp-mod-styled'
                })
            ]
        });
        pioneer.exporters.forEach(exporter => {
            pioneer.publishEvent(notebookPanel, {
                eventName: 'HintAlreadyExists',
                eventTime: Date.now(),
                eventInfo: {
                    gradeId: gradeId
                }
            }, exporter, false);
        });
    }
    else if (remainingHints[hintType] < 1) {
        showDialog({
            title: 'No hint left for this question.',
            buttons: [
                Dialog.createButton({
                    label: 'Dismiss',
                    className: 'jp-Dialog-button jp-mod-reject jp-mod-styled'
                })
            ]
        });
        pioneer.exporters.forEach(exporter => {
            pioneer.publishEvent(notebookPanel, {
                eventName: 'NotEnoughHint',
                eventTime: Date.now(),
                eventInfo: {
                    gradeId: gradeId
                }
            }, exporter, false);
        });
    }
    else {
        const uuid = uuidv4();
        const promptGroup = 'prompt';
        const configs = [
            {
                hintType: 'planning',
                serverHintType: 'plan',
                prompt: 'Considering the program you wrote and the feedback you have received from the system so far, what do you think is a possible issue with the program plan and problem-solving steps?'
            },
            {
                hintType: 'debugging',
                serverHintType: 'debug',
                prompt: 'Considering the program you wrote and the feedback you have received from the system so far, what do you think is a possible bug in the program?'
            },
            {
                hintType: 'optimizing',
                serverHintType: 'optimize',
                prompt: 'Considering the program you wrote and the feedback you have received from the system so far, what do you think is a possible issue with the program in terms of performance and readability?'
            }
        ];
        // Extract entire notebook content and the specific program for this question
        // Entire notebook JSON
        const notebookJSON = ((_b = notebookPanel.content.model) === null || _b === void 0 ? void 0 : _b.toJSON)
            ? notebookPanel.content.model.toJSON()
            : undefined;
        // Extract program: concatenate all code cells after the question markdown cell
        // until before the end-of-question cell. End-of-question is configurable via
        // questionEndGradeId.
        const cells = (_c = notebookPanel.content.model) === null || _c === void 0 ? void 0 : _c.cells;
        let program = '';
        if (cells) {
            for (let i = cellIndex + 1; i < cells.length; i++) {
                console.log('cell', i);
                const c = cells.get(i);
                const nbgraderMeta = c.getMetadata('nbgrader');
                const cGradeId = nbgraderMeta === null || nbgraderMeta === void 0 ? void 0 : nbgraderMeta.grade_id;
                // Stop when we reach the assertion cell for this question
                if (cGradeId && cGradeId === questionEndGradeId) {
                    console.log('Reached assertion cell:', i, cGradeId);
                    break;
                }
                // Append only code cells
                if (c.type === 'code') {
                    // Robustly read cell source across JupyterLab versions and widget/model shapes
                    const readCellSource = (cell) => {
                        if (!cell)
                            return '';
                        // 1) cell.value.text (ICellModel in many versions)
                        if (cell.value && typeof cell.value.text === 'string')
                            return cell.value.text;
                        // 2) cell.model.value.text (some widget wrappers expose model)
                        if (cell.model && cell.model.value && typeof cell.model.value.text === 'string')
                            return cell.model.value.text;
                        // 3) sharedModel.getSource() (some versions expose a sharedModel with getter)
                        const shared = cell.sharedModel || (cell.model && cell.model.sharedModel);
                        if (shared && typeof shared.getSource === 'function') {
                            try {
                                return shared.getSource();
                            }
                            catch (e) { /* ignore */ }
                        }
                        // 4) widget-level input model (cell.input.model.value.text)
                        if (cell.input && cell.input.model && cell.input.model.value && typeof cell.input.model.value.text === 'string')
                            return cell.input.model.value.text;
                        return '';
                    };
                    const code = readCellSource(c) || '';
                    // Keep cell boundaries with a newline to preserve structure
                    program += (program ? '\n' : '') + code;
                }
            }
        }
        // Print prompt to the console for debugging
        console.log(`Requesting ${hintType} hint for ${questionId} with prompt:`, configs.find(config => config.hintType === hintType)[promptGroup]);
        console.log('Program: `', program, '`');
        const response = await requestAPI('hint', {
            method: 'POST',
            body: JSON.stringify({
                hint_type: configs.find(config => config.hintType === hintType)
                    .serverHintType,
                // Use configurable questionId when provided; fallback to gradeId
                problem_id: questionId || gradeId,
                // Keep path for backward compatibility on server, but also send
                // the current notebook content and extracted program explicitly.
                buggy_notebook_path: notebookPanel.context.path,
                notebook_json: notebookJSON,
                program
            })
        });
        console.log('create ticket', response);
        const requestId = response === null || response === void 0 ? void 0 : response.request_id;
        remainingHints[hintType] -= 1;
        cell.setMetadata('remaining_hints', remainingHints);
        // The hint request bar DOM id was changed to use the canonical question id
        // (from questions.json).
        const containerId = questionId;
        const container = containerId ? document.getElementById(containerId) : null;
        if (container) {
            const btn = container.querySelector('.' + hintType);
            const span = btn === null || btn === void 0 ? void 0 : btn.querySelector('.hint-quantity');
            if (span)
                span.textContent = String(remainingHints[hintType]);
        }
        notebookPanel.context.save();
        const dialogResult = await showReflectionDialog(configs.find(config => config.hintType === hintType)[promptGroup]);
        pioneer.exporters.forEach(exporter => {
            pioneer.publishEvent(notebookPanel, {
                eventName: 'Reflection',
                eventTime: Date.now(),
                eventInfo: {
                    status: dialogResult.button.label,
                    gradeId: gradeId,
                    uuid: uuid,
                    hintType: hintType,
                    promptGroup: promptGroup,
                    prompt: configs.find(config => config.hintType === hintType)[promptGroup],
                    reflection: dialogResult.value
                }
            }, exporter, false);
        });
        if (dialogResult.button.label !== 'Cancel') {
            createHintBanner(notebookPanel, pioneer, cell, cellIndex, promptGroup, configs.find(config => config.hintType === hintType)[promptGroup], uuid, dialogResult.value, hintType, requestId);
        }
        // }
    }
};
