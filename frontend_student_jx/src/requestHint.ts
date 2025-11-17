import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { NotebookPanel } from '@jupyterlab/notebook';
import { Dialog, showDialog } from '@jupyterlab/apputils';
import { v4 as uuidv4 } from 'uuid';
import { IJupyterLabPioneer } from 'jupyterlab-pioneer';
import { showReflectionDialog } from './showReflectionDialog';
import { createHintBanner } from './createHintBanner';
import { ICellModel } from '@jupyterlab/cells';
import { requestAPI } from './handler';

export const requestHint = async (
  notebookPanel: NotebookPanel,
  pioneer: IJupyterLabPioneer,
  cell: ICellModel,
  cellIndex: number,
  hintType: string,
  questionId: string,
  questionEndGradeId: string
) => {
  const gradeId = cell.getMetadata('nbgrader')?.grade_id;
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
      pioneer.publishEvent(
        notebookPanel,
        {
          eventName: 'HintAlreadyExists',
          eventTime: Date.now(),
          eventInfo: {
            gradeId: gradeId
          }
        },
        exporter,
        false
      );
    });
  } else if (remainingHints[hintType] < 1) {
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
      pioneer.publishEvent(
        notebookPanel,
        {
          eventName: 'NotEnoughHint',
          eventTime: Date.now(),
          eventInfo: {
            gradeId: gradeId
          }
        },
        exporter,
        false
      );
    });
  } else {
    const uuid = uuidv4();
    const promptGroup = 'prompt';

    const configs = [
      {
        hintType: 'planning',
        serverHintType: 'plan',
        prompt:
          'Considering the program you wrote and the feedback you have received from the system so far, what do you think is a possible issue with the program plan and problem-solving steps?'
      },
      {
        hintType: 'debugging',
        serverHintType: 'debug',
        prompt:
          'Considering the program you wrote and the feedback you have received from the system so far, what do you think is a possible bug in the program?'
      },
      {
        hintType: 'optimizing',
        serverHintType: 'optimize',
        prompt:
          'Considering the program you wrote and the feedback you have received from the system so far, what do you think is a possible issue with the program in terms of performance and readability?'
      }
    ];

    // Extract entire notebook content and the specific program for this question
    // Entire notebook JSON
    const notebookJSON = (notebookPanel.content.model as any)?.toJSON
      ? (notebookPanel.content.model as any).toJSON()
      : undefined;

    // Extract program: concatenate all code cells after the question markdown cell
    // until before the end-of-question cell. End-of-question is configurable via
    // questionEndGradeId.
    const cells = notebookPanel.content.model?.cells;
    let program = '';
    if (cells) {
      for (let i = cellIndex + 1; i < cells.length; i++) {
        console.log('cell', i);
        const c = cells.get(i);
        const nbgraderMeta = c.getMetadata('nbgrader');
        const cGradeId = nbgraderMeta?.grade_id;
        // Stop when we reach the assertion cell for this question
        if (cGradeId && cGradeId === questionEndGradeId) {
          console.log('Reached assertion cell:', i, cGradeId);
          break;
        }
        // Append only code cells
        if (c.type === 'code') {
          // Robustly read cell source across JupyterLab versions and widget/model shapes
          const readCellSource = (cell: any) => {
            if (!cell) return '';
            // 1) cell.value.text (ICellModel in many versions)
            if (cell.value && typeof cell.value.text === 'string') return cell.value.text;
            // 2) cell.model.value.text (some widget wrappers expose model)
            if (cell.model && cell.model.value && typeof cell.model.value.text === 'string') return cell.model.value.text;
            // 3) sharedModel.getSource() (some versions expose a sharedModel with getter)
            const shared = cell.sharedModel || (cell.model && cell.model.sharedModel);
            if (shared && typeof shared.getSource === 'function') {
              try { return shared.getSource(); } catch (e) { /* ignore */ }
            }
            // 4) widget-level input model (cell.input.model.value.text)
            if (cell.input && cell.input.model && cell.input.model.value && typeof cell.input.model.value.text === 'string') return cell.input.model.value.text;
            return '';
          };

          const code = readCellSource(c as any) || '';
          // Keep cell boundaries with a newline to preserve structure
          program += (program ? '\n' : '') + code;
        }
      }
    }

    // Print prompt to the console for debugging
    console.log(
      `Requesting ${hintType} hint for ${questionId} with prompt:`,
      configs.find(config => config.hintType === hintType)[promptGroup]
    );
    console.log('Program: `', program, '`');

    const response: any = await requestAPI('hint', {
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
    const requestId = response?.request_id;

    remainingHints[hintType] -= 1;
    cell.setMetadata('remaining_hints', remainingHints);
    // The hint request bar DOM id was changed to use the canonical question id
    // (from questions.json).
    const containerId = questionId;
    const container = containerId ? document.getElementById(containerId) : null;
    if (container) {
      const btn = container.querySelector('.' + hintType) as HTMLElement | null;
      const span = btn?.querySelector('.hint-quantity') as HTMLElement | null;
      if (span) span.textContent = String(remainingHints[hintType]);
    }
    notebookPanel.context.save();

    const dialogResult = await showReflectionDialog(
      configs.find(config => config.hintType === hintType)[promptGroup]
    );

    pioneer.exporters.forEach(exporter => {
      pioneer.publishEvent(
        notebookPanel,
        {
          eventName: 'Reflection',
          eventTime: Date.now(),
          eventInfo: {
            status: dialogResult.button.label,
            gradeId: gradeId,
            uuid: uuid,
            hintType: hintType,
            promptGroup: promptGroup,
            prompt: configs.find(config => config.hintType === hintType)[
              promptGroup
            ],
            reflection: dialogResult.value
          }
        },
        exporter,
        false
      );
    });
    if (dialogResult.button.label !== 'Cancel') {
      createHintBanner(
        notebookPanel,
        pioneer,
        cell,
        cellIndex,
        promptGroup,
        configs.find(config => config.hintType === hintType)[promptGroup],
        uuid,
        dialogResult.value,
        hintType,
        requestId
      );
    }
    // }
  }
};
