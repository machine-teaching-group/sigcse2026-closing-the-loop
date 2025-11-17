import React from 'react';
import { HistoricHintItem } from '../types/api';

interface Props {
  visible: boolean;
  currentHint: HistoricHintItem | null;
  onHelpful: () => void;
  onUnhelpful: () => void;
  onEscalate: (notes: string) => void;
  loading: boolean;
  onDismiss: () => void;
  // new props for email-based dynamic escalation guidance
  studentEmail: string;
  isStudentEmailValid: boolean;
}

// Simplified: once a user clicks Unhelpful we always present the escalation form.
export const HINT_OVERLAY_VH = 40; // unified height (in viewport height units)

export const HintOverlay: React.FC<Props> = ({ visible, currentHint, onHelpful, onUnhelpful, onEscalate, loading, onDismiss, studentEmail, isStudentEmailValid }) => {
  const [escalating, setEscalating] = React.useState(false);
  const [notes, setNotes] = React.useState('');
  const [submittingEscalation, setSubmittingEscalation] = React.useState(false);

  // Reset escalation state when a new hint is displayed or overlay just became visible
  React.useEffect(() => {
    if (!visible) return; // allow cleanup only when showing a hint
    setEscalating(false);
    setNotes('');
  }, [currentHint?.id, visible]);

  if (!visible) return null;

  let emailSentence: string;
  if (!studentEmail) {
    emailSentence = 'You have not entered your email address. If you provide it in the EMAIL box, the system will email you once a response is available.';
  } else if (studentEmail && !isStudentEmailValid) {
    emailSentence = 'The email address you entered in the EMAIL box is not valid. If you fix it to a valid email address, the system will email you once a response is available.';
  } else { // non-empty & valid
    emailSentence = 'You have entered your email address, so the system will email you once a response is available.';
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-white shadow-lg border-b border-gray-200 z-40 flex flex-col animate-[fadeSlideDown_0.25s_ease-out]"
      style={{ height: `${HINT_OVERLAY_VH}vh` }}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">{currentHint?.type === 'instructor' ? 'Instructor Feedback' : 'AI Hint'}</h2>
        {loading && <span className="text-sm text-gray-500 animate-pulse">Fetching...</span>}
      </div>
      <div className="flex-1 overflow-y-auto hint-scrollbar">
        <div className="h-full min-h-full flex items-center p-4 text-sm whitespace-pre-wrap w-full">
          {currentHint?.content ? currentHint.content : <span className="text-gray-500">No hint content yet...</span>}
        </div>
      </div>
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex items-center gap-3">
        {!escalating && (
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs text-gray-500">Rate this {currentHint?.type === 'instructor' ? 'feedback' : 'hint'}</span>
            <button onClick={() => { onUnhelpful(); setEscalating(true); }} className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-sm">
              <span role="img" aria-label="thumbs down" className="mr-1.5">👎</span>
              Unhelpful
            </button>
            <button onClick={onHelpful} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm">
              <span role="img" aria-label="thumbs up" className="mr-1.5">👍</span>
              Helpful
            </button>
          </div>
        )}
        {escalating && currentHint?.type !== 'instructor' && (
          <div className="flex-1 flex flex-col gap-2">
            <p className="text-sm leading-snug text-gray-600 whitespace-pre-wrap">
              {"I'm sorry that the AI hint was not helpful.\nDo you want to escalate to request some feedback from a human instructor?\n"}
              <br />
              {emailSentence}
            </p>
            <div className="flex items-start gap-2">
              <textarea
                value={notes}
                onChange={e=>setNotes(e.target.value)}
                placeholder="Here you can optionally provide more context on why the AI hint is not useful..."
                className="flex-1 text-xs border rounded p-2 h-16 resize-none"
              />
              <div className="flex flex-col gap-1 h-16">
                <button
                  onClick={onDismiss}
                  disabled={notes.trim().length>0}
                  title={notes.trim().length>0 ? "To select Don't Escalate, you should empty the textbox" : undefined}
                  className={`px-3 py-1.5 rounded text-sm ${notes.trim().length>0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-300 hover:bg-gray-200 text-gray-800'}`}
                >Don't Escalate</button>
                <button
                  onClick={async () => {
                    if (submittingEscalation) return;
                    setSubmittingEscalation(true);
                    try {
                      // onEscalate is provided by the parent and may perform network
                      // calls. Guard with try/catch so rejections are handled here
                      // and don't become unhandled promise rejections.
                      await Promise.resolve(onEscalate(notes));
                    } catch (err) {
                      // eslint-disable-next-line no-console
                      console.error('Escalation failed', err);
                    } finally {
                      setSubmittingEscalation(false);
                    }
                  }}
                  disabled={submittingEscalation}
                  className={`px-3 py-1.5 rounded text-sm flex items-center justify-center min-w-[90px] ${submittingEscalation ? 'bg-indigo-400 text-white cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                >
                  {submittingEscalation && <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2" />}
                  {submittingEscalation ? 'Submitting' : 'Escalate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
