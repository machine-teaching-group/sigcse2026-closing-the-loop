import { NotebookPanel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';
import { IJupyterLabPioneer } from 'jupyterlab-pioneer';
import { requestAPI } from './handler';
import { Notification } from '@jupyterlab/apputils';

export const checkInstructorFeedback = async (
  cell: ICellModel,
  notebookPanel: NotebookPanel,
  pioneer: IJupyterLabPioneer
) => {
  const hintHistoryData = cell.getMetadata('hintHistory');
  let receivedNewInstructorFeedbackOrNot = false;
  if (hintHistoryData) {
    for (let i = 0; i < hintHistoryData.length; i++) {
      if (!hintHistoryData[i].isGPT && hintHistoryData[i]?.hintContent === 0) {
        const response: any = await requestAPI('check_ta', {
          method: 'POST',
          body: JSON.stringify({
            request_id: hintHistoryData[i].requestId
          })
        });
        if (response.statusCode == 200) {
          if (response.feedback_ready) {
            hintHistoryData[i]['hintContent'] = response.feedback;
            const questionIndex = cell.getMetadata('questionIndex');
            Notification.info(
              `Instructor feedback for Question ${questionIndex} is now available. You can view it by expanding the bar beneath the question.`,
              { autoClose: 20000 }
            );
            receivedNewInstructorFeedbackOrNot = true;
            pioneer.exporters.forEach(exporter => {
              pioneer.publishEvent(
                notebookPanel,
                {
                  eventName: 'GetInstructorHint',
                  eventTime: Date.now(),
                  eventInfo: {
                    gradeId: cell.getMetadata('nbgrader').grade_id,
                    requestId: hintHistoryData[i].requestId,
                    hintType: hintHistoryData[i].hintType,
                    hintContent: response.feedback
                  }
                },
                exporter,
                false
              );
            });
          }
        } else {
          hintHistoryData[i]['error'] = response.message;

          pioneer.exporters.forEach(exporter => {
            pioneer.publishEvent(
              notebookPanel,
              {
                eventName: 'GetInstructorHintError',
                eventTime: Date.now(),
                eventInfo: {
                  gradeId: cell.getMetadata('nbgrader').grade_id,
                  requestId: hintHistoryData[i].requestId,
                  hintType: hintHistoryData[i].hintType,
                  error: response.message
                }
              },
              exporter,
              false
            );
          });
        }
      }
    }
  }
  if (receivedNewInstructorFeedbackOrNot) {
    cell.setMetadata('hintHistory', hintHistoryData);
  }
  return receivedNewInstructorFeedbackOrNot;
};

export const createHintHistoryBar = async (
  cell: ICellModel,
  cellIndex: number,
  notebookPanel: NotebookPanel,
  pioneer: IJupyterLabPioneer
) => {
  if (document.getElementById(`hint-history-bar-${cell.id}`)) {
    document.getElementById(`hint-history-bar-${cell.id}`).remove();
  }
  const hintHistoryData = cell.getMetadata('hintHistory');
  const hintHistoryBar = document.createElement('div');
  hintHistoryBar.classList.add('hint-history-bar');
  hintHistoryBar.id = `hint-history-bar-${cell.id}`;

  if (hintHistoryData && hintHistoryData.length > 0) {
    // Sort entries the same way as frontend_student: group by ai_request_id (or requestId),
    // then when equal prefer AI items before instructor items.
    const sorted = [...hintHistoryData].sort((a: any, b: any) => {
      const aid = Number(a.ai_request_id ?? a.aiRequestId ?? a.requestId ?? a.id ?? 0);
      const bid = Number(b.ai_request_id ?? b.aiRequestId ?? b.requestId ?? b.id ?? 0);
      if (aid !== bid) return aid - bid;
      const aType = a.isGPT ? 'ai' : 'instructor';
      const bType = b.isGPT ? 'ai' : 'instructor';
      if (aType !== bType) return aType === 'ai' ? -1 : 1;
      return 0;
    });

    const showEdgeLabels = sorted.length > 1;
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const isEarliest = showEdgeLabels && i === 0;
      const isLatest = showEdgeLabels && i === sorted.length - 1 && !isEarliest;
      if (item?.hintContent !== 0) {
        const hintHistoryBarEntry = document.createElement('div');
        const accordion = document.createElement('button');
        accordion.classList.add('accordion');
        if (!item.isGPT) accordion.classList.add('ta-accordion');

        // Build header content: label + optional rating icon
        const labelSpan = document.createElement('span');
        // Map known AI hint types to friendly display names
        const aiHintTypeMap: { [key: string]: string } = {
          plan: 'Planning Hint',
          debug: 'Debugging Hint',
          optimize: 'Optimization Hint'
        };
        const rawType = (item.hintType || '').toString();
        if (item.isGPT) {
          const friendly = aiHintTypeMap[rawType.toLowerCase()];
          labelSpan.textContent = friendly ? friendly : `AI hint (${rawType})`;
        } else {
          labelSpan.textContent = `Instructor feedback`;
        }
        labelSpan.classList.add('history-label');
        labelSpan.style.whiteSpace = 'nowrap';

        accordion.appendChild(labelSpan);

        // Determine rating icon if present
        let ratedThumb: string | null = null;
        if (item.isGPT) {
          if (item.helpful !== undefined && item.helpful !== null) ratedThumb = item.helpful ? '👍' : '👎';
        } else {
          if (item.instructor_helpful !== undefined && item.instructor_helpful !== null) ratedThumb = item.instructor_helpful ? '👍' : '👎';
        }
        if (ratedThumb) {
          const ratingSpan = document.createElement('span');
          ratingSpan.classList.add('history-rating');
          ratingSpan.textContent = ` ${ratedThumb}`;
          ratingSpan.setAttribute('aria-hidden', 'true');
          accordion.appendChild(ratingSpan);
        }

        // Append earliest/latest labels (gray) to the header when there are multiple items
        if (isEarliest) {
          const edgeSpan = document.createElement('span');
          edgeSpan.classList.add('history-edge');
          edgeSpan.textContent = ' (earliest)';
          accordion.appendChild(edgeSpan);
        } else if (isLatest) {
          const edgeSpan = document.createElement('span');
          edgeSpan.classList.add('history-edge');
          edgeSpan.textContent = ' (latest)';
          accordion.appendChild(edgeSpan);
        }

        const panel = document.createElement('div');
        panel.classList.add('accordion-panel');
        const historyText = document.createElement('p');
        historyText.innerText = item.hintContent;
        panel.appendChild(historyText);
        hintHistoryBarEntry.appendChild(accordion);
        hintHistoryBarEntry.appendChild(panel);
        hintHistoryBar.appendChild(hintHistoryBarEntry);

        accordion.addEventListener('click', function () {
          this.classList.toggle('active');
          if (panel.style.maxHeight) {
            panel.style.maxHeight = null;
          } else {
            panel.style.maxHeight = panel.scrollHeight + 'px';
          }
          pioneer.exporters.forEach(exporter => {
            pioneer.publishEvent(
              notebookPanel,
              {
                eventName: this.classList.contains('active')
                  ? 'HintHistoryReview'
                  : 'HintHistoryHide',
                eventTime: Date.now(),
                eventInfo: {
                  gradeId: cell.getMetadata('nbgrader').grade_id,
                  requestId: item.requestId,
                  isGPT: item.isGPT,
                  hintType: item.hintType,
                  hintContent: item.hintContent
                }
              },
              exporter,
              false
            );
          });
        });
      } else if (item?.errorMessage || item?.error) {
        const accordion = document.createElement('button');
        accordion.classList.add('accordion', 'accordion-error');
        // Build error header with id + label
        const displayIdErr = item.ai_request_id ?? item.requestId ?? item.id ?? 0;
        const idSpanErr = document.createElement('span');
        idSpanErr.classList.add('history-id');
        idSpanErr.textContent = `[#${displayIdErr}] `;
        const labelErr = document.createElement('span');
        labelErr.textContent = item.error || item.errorMessage;
        accordion.appendChild(idSpanErr);
        accordion.appendChild(labelErr);
        // Edge labels for error entries too
        if (isEarliest) {
          const edgeSpanErr = document.createElement('span');
          edgeSpanErr.classList.add('history-edge');
          edgeSpanErr.textContent = ' (earliest)';
          accordion.appendChild(edgeSpanErr);
        } else if (isLatest) {
          const edgeSpanErr = document.createElement('span');
          edgeSpanErr.classList.add('history-edge');
          edgeSpanErr.textContent = ' (latest)';
          accordion.appendChild(edgeSpanErr);
        }
        const hintHistoryBarEntry = document.createElement('div');
        hintHistoryBarEntry.appendChild(accordion);
        hintHistoryBar.appendChild(hintHistoryBarEntry);
      }
    }
    notebookPanel.content.widgets[cellIndex].node.appendChild(hintHistoryBar);
  }
};
