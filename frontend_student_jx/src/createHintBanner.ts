import { NotebookPanel } from '@jupyterlab/notebook';
import { Dialog, showDialog } from '@jupyterlab/apputils';
import { ICellModel } from '@jupyterlab/cells';
import { IJupyterLabPioneer } from 'jupyterlab-pioneer';
import { requestAPI } from './handler';
import { createHintHistoryBar } from './createHintHistoryBar';
import { showTAReflectionDialog } from './showTAReflectionDialog';
import { setBannerActive } from './bannerActive';

export const createHintBanner = async (
  notebookPanel: NotebookPanel,
  pioneer: IJupyterLabPioneer,
  cell: ICellModel,
  cellIndex: number,
  promptGroup: string,
  prompt: string,
  uuid: string,
  preReflection: string,
  hintType: string,
  requestId: string,
  options?: { preloadedContent?: string; skipNetwork?: boolean }
) => {
  const gradeId = cell.getMetadata('nbgrader').grade_id;

  const hintBannerPlaceholder = document.createElement('div');
  hintBannerPlaceholder.id = 'hint-banner-placeholder';
  notebookPanel.content.node.insertBefore(
    hintBannerPlaceholder,
    notebookPanel.content.node.firstChild
  );

  const hintBanner = document.createElement('div');
  hintBanner.id = 'hint-banner';
  notebookPanel.content.node.parentElement?.insertBefore(
    hintBanner,
    notebookPanel.content.node
  );
  // Mark banner active to allow global UI styling (disable hint buttons)
  setBannerActive(true);
  const renderRatingUI = (contentToShow: string) => {
    // Build content area for the hint text
    hintBanner.innerHTML = '';

    // Title: show whether this is an AI hint or instructor feedback
    const titleRow = document.createElement('div');
    titleRow.id = 'hint-banner-title-row';
    const titleDiv = document.createElement('div');
    titleDiv.classList.add('hint-banner-title');
    titleDiv.textContent = hintType === 'instructor' ? 'Instructor Feedback' : 'AI Hint';
    titleRow.appendChild(titleDiv);
    hintBanner.appendChild(titleRow);

    const contentContainer = document.createElement('div');
    contentContainer.id = 'hint-banner-content';
    const contentP = document.createElement('p');
    contentP.textContent = contentToShow;
    contentContainer.appendChild(contentP);
    hintBanner.appendChild(contentContainer);

    const hintBannerButtonsContainer = document.createElement('div');
    hintBannerButtonsContainer.id = 'hint-banner-buttons-container';

    const hintBannerButtons = document.createElement('div');
    hintBannerButtons.id = 'hint-banner-buttons';
    const helpfulButton = document.createElement('button');
    helpfulButton.classList.add('hint-banner-button', 'hint-button-helpful');
    helpfulButton.innerText = '👍 Helpful';
    const unhelpfulButton = document.createElement('button');
    unhelpfulButton.classList.add('hint-banner-button', 'hint-button-unhelpful');
    unhelpfulButton.innerText = '👎 Unhelpful';

    // Order: Unhelpful then Helpful
    hintBannerButtons.appendChild(unhelpfulButton);
    hintBannerButtons.appendChild(helpfulButton);

    hintBannerButtonsContainer.appendChild(hintBannerButtons);
    hintBanner.appendChild(hintBannerButtonsContainer);

    const hintBannerButtonClicked = async (evaluation: string) => {
      pioneer.exporters.forEach(exporter => {
        pioneer.publishEvent(
          notebookPanel,
          {
            eventName: 'HintEvaluated',
            eventTime: Date.now(),
            eventInfo: {
              gradeId: gradeId,
              requestId: requestId,
              hintContent: contentToShow,
              evaluation: evaluation,
              promptGroup: promptGroup,
              prompt: prompt,
              uuid: uuid,
              preReflection: preReflection,
              hintType: hintType
            }
          },
          exporter,
          false
        );
      });
      // Update local hintHistory metadata immediately
      try {
        const meta = cell.getMetadata('hintHistory') || [];
        const idx = meta.findIndex((m: any) => String(m.requestId) === String(requestId));
        if (idx >= 0) {
          meta[idx].helpful = evaluation === 'helpful';
          cell.setMetadata('hintHistory', meta);
        }
      } catch { }
      // Remove rating buttons and refresh history bar to reflect the rating
      helpfulButton.remove();
      unhelpfulButton.remove();
      createHintHistoryBar(cell, cellIndex, notebookPanel, pioneer);
      // Persist rating to backend
      try {
        await requestAPI('save_rating', {
          method: 'POST',
          body: JSON.stringify({ request_id: requestId, is_hint_helpful: evaluation === 'helpful' })
        });
      } catch (e) {
        console.error('Failed to save hint rating', e);
      }
    };
    helpfulButton.onclick = () => {
      hintBannerButtonClicked('helpful');
      hintBanner.remove();
      hintBannerPlaceholder.remove();
      setBannerActive(false);
    };
    unhelpfulButton.onclick = () => {
      hintBannerButtonClicked('unhelpful');

      // Mirror frontend_student: immediately show escalation form with textarea and buttons
      hintBanner.innerHTML = '';
      // Set escalation banner background to gray to separate from content
      hintBanner.style.backgroundColor = '#f3f4f6';

      const contentContainer = document.createElement('div');
      contentContainer.id = 'hint-banner-content';
      // Stack items vertically for escalation view using CSS class
      // Use the escalation modifier class so CSS controls the layout and
      // appearance. The more-specific selector in base.css ensures this
      // overrides the default #hint-banner-content rules.
      contentContainer.classList.add('hint-banner-escalation');
      // Very top: show "AI Hint"
      const aiHintLabel = document.createElement('span');
      aiHintLabel.style.cssText = 'font-size: 15px; font-weight: 600; color: #6b7280; letter-spacing: 0.05em;';
      aiHintLabel.textContent = 'AI Hint';
      contentContainer.appendChild(aiHintLabel);

      // Top: show the AI hint content in a white box to separate it visually
      const hintBox = document.createElement('div');
      // Align contents left and center vertically within the hint box
      hintBox.style.cssText = 'display: flex; align-items: center; justify-content: flex-start; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; min-height: calc(1.4em * 3);';
      const hintTop = document.createElement('p');
      hintTop.style.cssText = 'margin: 0; font-size: 14px; line-height: 1.4; color: #111827; white-space: pre-wrap;';
      hintTop.textContent = contentToShow;
      hintBox.appendChild(hintTop);
      contentContainer.appendChild(hintBox);

      // Message text matching frontend_student
      const messageText = document.createElement('p');
      messageText.style.cssText = 'margin-bottom: 8px; font-size: 14px; line-height: 1.4; color: #4b5563; white-space: pre-wrap;';
      // messageText.style.cssText = 'display: flex; justify-content: flex-start; margin-bottom: 8px; font-size: 14px; line-height: 1.4; color: #4b5563; white-space: pre-wrap;';
      messageText.textContent = "\nI'm sorry that the AI hint was not helpful.\nDo you want to escalate to request some feedback from a human instructor?";
      contentContainer.appendChild(messageText);

      // Email instruction row: text on the left, smaller input on the right
      const emailRow = document.createElement('div');
      // Align items left horizontally and center them vertically
      emailRow.style.cssText = 'display: flex; justify-content: flex-start; align-items: center; gap: 12px; width: 100%;';
      const emailLabel = document.createElement('span');
      emailLabel.style.cssText = 'font-size: 13px; line-height: 1.4; color: #6b7280;';
      emailLabel.textContent = 'Enter your email to get a notification once a response is available:';
      emailRow.appendChild(emailLabel);

      // Email input (smaller width on the right)
      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.placeholder = 'your-email@something.edu';
      emailInput.style.cssText = 'padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; width: 220px; max-width: 40%;';
      emailRow.appendChild(emailInput);
      contentContainer.appendChild(emailRow);

      // Form container for notes + actions
      const formContainer = document.createElement('div');
      formContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

      // Notes + Buttons in the same row
      const notesRow = document.createElement('div');
      notesRow.style.cssText = 'display: flex; gap: 8px; align-items: stretch; width: 100%;';

      const notesTextarea = document.createElement('textarea');
      notesTextarea.placeholder = 'Here you can optionally provide more context on why the AI hint is not useful...';
      notesTextarea.style.cssText = 'flex: 1 1 auto; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; resize: vertical; min-height: 80px; height: auto;';
      notesRow.appendChild(notesTextarea);

      const buttonsContainer = document.createElement('div');
      // Vertical stack of two buttons with same width, total height equal to textarea height
      buttonsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; margin-left: auto; width: 150px; padding: 0;';

      const dontEscalateButton = document.createElement('button');
      dontEscalateButton.classList.add('hint-banner-cancel-button');
      dontEscalateButton.innerText = "Don't Escalate";
      dontEscalateButton.style.cssText = 'padding: 6px 12px; border-radius: 4px; font-size: 13px; white-space: nowrap; display: flex; justify-content: center; align-items: center; flex: 1 1 0;';

      const escalateButton = document.createElement('button');
      escalateButton.classList.add('hint-banner-button', 'hint-button-escalate');
      escalateButton.innerText = 'Escalate';
      escalateButton.style.cssText = 'padding: 6px 12px; border-radius: 4px; font-size: 13px; white-space: nowrap; display: flex; justify-content: center; align-items: center; flex: 1 1 0;';

      buttonsContainer.appendChild(dontEscalateButton);
      buttonsContainer.appendChild(escalateButton);
      notesRow.appendChild(buttonsContainer);

      formContainer.appendChild(notesRow);
      contentContainer.appendChild(formContainer);
      hintBanner.appendChild(contentContainer);

      // Don't Escalate handler
      dontEscalateButton.onclick = () => {
        // Disable if user has entered notes (mirrors web behavior)
        if (notesTextarea.value.trim().length > 0) {
          return; // ignore click
        }
        pioneer.exporters.forEach(exporter => {
          pioneer.publishEvent(
            notebookPanel,
            {
              eventName: 'InstructorRequestCanceled',
              eventTime: Date.now(),
              eventInfo: {
                gradeId: gradeId,
                requestId: requestId,
                uuid: uuid,
                hintType: hintType
              }
            },
            exporter,
            false
          );
        });
        hintBanner.remove();
        hintBannerPlaceholder.remove();
        setBannerActive(false);
      };

      // Update button state based on textarea/email content
      const updateButtonStates = () => {
        const hasNotes = notesTextarea.value.trim().length > 0;
        if (hasNotes) {
          dontEscalateButton.disabled = true;
          dontEscalateButton.style.opacity = '0.5';
          dontEscalateButton.style.cursor = 'not-allowed';
          dontEscalateButton.title = "To select Don't Escalate, you should empty the textbox";
        } else {
          dontEscalateButton.disabled = false;
          dontEscalateButton.style.opacity = '1';
          dontEscalateButton.style.cursor = 'pointer';
          dontEscalateButton.title = '';
        }
      };

      notesTextarea.addEventListener('input', updateButtonStates);
      // Only notes affect Don't Escalate state; email does not

      // Escalate handler
      escalateButton.onclick = async () => {
        pioneer.exporters.forEach(exporter => {
          pioneer.publishEvent(
            notebookPanel,
            {
              eventName: 'InstructorRequestContinued',
              eventTime: Date.now(),
              eventInfo: {
                gradeId: gradeId,
                requestId: requestId,
                uuid: uuid,
                hintType: hintType
              }
            },
            exporter,
            false
          );
        });

        pioneer.exporters.forEach(exporter => {
          pioneer.publishEvent(
            notebookPanel,
            {
              eventName: 'InstructorReflection',
              eventTime: Date.now(),
              eventInfo: {
                status: 'Submit',
                gradeId: gradeId,
                uuid: uuid,
                hintType: hintType,
                email: emailInput.value.trim(),
                reflection: notesTextarea.value.trim()
              }
            },
            exporter,
            false
          );
        });

        try {
          const response: any = await requestAPI('ta', {
            method: 'POST',
            body: JSON.stringify({
              request_id: requestId,
              student_email: emailInput.value.trim() || undefined,
              student_notes: notesTextarea.value.trim() || undefined,
              problem_id: gradeId
            })
          });
          console.log('create ta ticket', response);

          if (response.statusCode !== 200) {
            showDialog({
              title: response?.message || 'Error',
              buttons: [
                Dialog.createButton({
                  label: 'Dismiss',
                  className: 'jp-Dialog-button jp-mod-reject jp-mod-styled'
                })
              ]
            });
          } else {
            const hintHistory = cell.getMetadata('hintHistory') || [];
            cell.setMetadata('hintHistory', [
              ...hintHistory,
              {
                requestId: requestId,
                isGPT: false,
                hintType: hintType,
                hintContent: 0
              }
            ]);

            hintBanner.innerHTML = '';
            // Keep the escalation gray background for success message
            hintBanner.style.backgroundColor = '#f3f4f6';
            // Make the banner a column flex container so the message area can take remaining space
            hintBanner.style.display = 'flex';
            hintBanner.style.flexDirection = 'column';

            // Content area: takes remaining height, text left-aligned and vertically centered
            const contentArea = document.createElement('div');
            contentArea.style.cssText = 'flex: 1 1 auto; display: flex; align-items: center; justify-content: flex-start; padding: 12px 16px;';

            const successMessage = document.createElement('p');
            successMessage.style.cssText = 'margin: 0; font-size: 14px; color: #111827; white-space: pre-wrap;';
            const emailProvided = emailInput && emailInput.value && emailInput.value.trim().length > 0;
            if (emailProvided) {
              successMessage.innerText = 'Request sent! You will receive a response via email when an instructional team member has reviewed your request.';
            } else {
              successMessage.innerText = 'Request sent! Check this notebook later for feedback from an instructional team member.';
            }

            contentArea.appendChild(successMessage);
            hintBanner.appendChild(contentArea);

            // Bottom area: centered Close button
            const bottomArea = document.createElement('div');
            bottomArea.style.cssText = 'display: flex; justify-content: center; padding: 12px;';

            const closeButton = document.createElement('button');
            closeButton.classList.add('hint-banner-cancel-button');
            closeButton.innerText = 'Close';
            closeButton.style.cssText = 'padding: 6px 12px;';
            bottomArea.appendChild(closeButton);
            hintBanner.appendChild(bottomArea);

            notebookPanel.context.save();

            closeButton.onclick = () => {
              hintBanner.remove();
              hintBannerPlaceholder.remove();
              setBannerActive(false);
            };
          }
        } catch (error) {
          console.error('Error escalating to instructor:', error);
          showDialog({
            title: 'Error escalating request',
            buttons: [
              Dialog.createButton({
                label: 'Dismiss',
                className: 'jp-Dialog-button jp-mod-reject jp-mod-styled'
              })
            ]
          });
        }
      };
    };

  };

  // If we are showing a preloaded hint (history sync), render immediately without network
  if (options?.skipNetwork) {
    // No loader or cancel button; directly show content and rating UI
    renderRatingUI(options.preloadedContent || '');
    return;
  }

  // Default path: show loader and allow cancel while generating a new hint
  hintBanner.innerHTML =
    '<div id="hint-banner-content"><p><span class="loader"></span>Retrieving hint... Please do not refresh the page. You can continue to work on the assignment in the meantime.</p></div>';

  const hintBannerCancelButton = document.createElement('div');
  hintBannerCancelButton.classList.add('hint-banner-cancel-button');
  hintBannerCancelButton.innerText = 'Cancel request';
  // Center the cancel button and shrink to fit
  hintBannerCancelButton.style.cssText = 'display: inline-block; align-self: center; margin-top: 8px;';
  hintBanner.appendChild(hintBannerCancelButton);
  hintBannerCancelButton.onclick = async () => {
    await requestAPI('cancel', {
      method: 'POST',
      body: JSON.stringify({
        request_id: requestId
      })
    });
  };

  const hintRequestCompleted = (hintContent: string, requestId: string) => {
    const hintHistory = cell.getMetadata('hintHistory') || [];
    cell.setMetadata('hintHistory', [
      ...hintHistory,
      {
        requestId: requestId,
        isGPT: true,
        hintType: hintType,
        hintContent: hintContent
      }
    ]);
    pioneer.exporters.forEach(exporter => {
      pioneer.publishEvent(
        notebookPanel,
        {
          eventName: 'HintRequestCompleted',
          eventTime: Date.now(),
          eventInfo: {
            hintContent: hintContent,
            gradeId: gradeId,
            requestId: requestId,
            promptGroup: promptGroup,
            prompt: prompt,
            uuid: uuid,
            preReflection: preReflection,
            hintType: hintType
          }
        },
        exporter,
        true
      );
    });
    // Render rating UI for newly completed hint
    renderRatingUI(hintContent);
    hintBannerCancelButton.remove();
  };

  const hintRequestCancelled = (requestId: string) => {
    hintBanner.remove();
    hintBannerPlaceholder.remove();
    setBannerActive(false);
    showDialog({
      title: 'Hint Request Cancelled',
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
          eventName: 'HintRequestCancelled',
          eventTime: Date.now(),
          eventInfo: {
            gradeId: gradeId,
            requestId: requestId,
            promptGroup: promptGroup,
            prompt: prompt,
            uuid: uuid,
            preReflection: preReflection,
            hintType: hintType
          }
        },
        exporter,
        false
      );
    });
  };

  const hintRequestError = (e: Error) => {
    hintBanner.remove();
    hintBannerPlaceholder.remove();
    setBannerActive(false);

    const remainingHints = cell.getMetadata('remaining_hints');
    remainingHints[hintType] += 1;
    cell.setMetadata('remaining_hints', remainingHints);
    // Guard DOM updates: the hint request bar DOM id may not be the nbgrader gradeId
    // (we use a canonical question_id as the bar id). Avoid throwing if the
    // element is missing by checking existence before querying children.
    try {
      const container = gradeId ? document.getElementById(gradeId) : null;
      if (container) {
        const btn = container.querySelector('.' + hintType) as HTMLElement | null;
        const span = btn?.querySelector('.hint-quantity') as HTMLElement | null;
        if (span) span.innerHTML = String(remainingHints[hintType]);
      }
    } catch (err) {
      // Swallow any DOM errors to avoid breaking the UI flow
      console.warn('Could not update remaining_hints UI after error:', err);
    }
    notebookPanel.context.save();

    showDialog({
      title: 'Hint Request Error. Please try again later',
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
          eventName: 'HintRequestError',
          eventTime: Date.now(),
          eventInfo: {
            gradeId: gradeId,
            requestId: e?.message,
            promptGroup: promptGroup,
            prompt: prompt,
            uuid: uuid,
            preReflection: preReflection,
            hintType: hintType
          }
        },
        exporter,
        false
      );
    });
  };

  const STATUS = {
    Loading: 0,
    Success: 1,
    Cancelled: 2,
    Error: 3
  };

  try {
    const response: any = await requestAPI('reflection', {
      method: 'POST',
      body: JSON.stringify({
        request_id: requestId,
        reflection_question: prompt,
        reflection_answer: preReflection
      })
    });
    console.log('Sent reflection', response);
    if (!response) {
      throw new Error();
    } else {
      const intervalId = setInterval(async () => {
        const response: any = await requestAPI('check', {
          method: 'POST',
          body: JSON.stringify({
            request_id: requestId
          })
        });
        if (response.status === STATUS['Loading']) {
          console.log('loading');
        } else if (response.status === STATUS['Success']) {
          console.log('success');
          clearInterval(intervalId);
          hintRequestCompleted(JSON.parse(response.result).feedback, requestId);
        } else if (response.status === STATUS['Cancelled']) {
          console.log('cancelled');
          clearInterval(intervalId);
          hintRequestCancelled(requestId);
        } else {
          clearInterval(intervalId);
          hintRequestError(new Error(requestId));
        }
      }, 1000);
    }
  } catch (e) {
    console.log(e);
    hintRequestError(e as Error);
  }
};
