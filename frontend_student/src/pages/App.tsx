import React, { useEffect, useMemo, useState, useRef } from 'react';
import { logDebug, logError, logInfo, logWarn, withTiming } from '../lib/logger';
import { ProgrammingProblem, ExecuteProgramResponse, HistoricHintItem, QuotaInfo } from '../types/api';
import { fetchProblems, fetchSingleProblem, executeProgram, addAIHintRequest, addReflection, pollAIHint, requestInstructorFeedback, queryAllAIHints, queryAllInstructorFeedback, saveHintRating, fetchQuotaLeft, setApiErrorHandler, saveInstructorFeedbackRating, fetchHasEverRequested, cancelAIHintRequest } from '../lib/api';
// Removed StudentIdInput gating in main UI; we now gate the entire app behind a Student ID entry screen
import { ProblemSelector } from '../components/ProblemSelector';
import { HintButtons } from '../components/HintButtons';
import { HintOverlay, HINT_OVERLAY_VH } from '../components/HintOverlay';
import { HistoryList } from '../components/HistoryList';
import Editor from '@monaco-editor/react';
import { usePolling } from '../hooks/usePolling';

interface PendingAIHint {
  request_id: number;
  type: 'plan' | 'debug' | 'optimize';
  created_at: string;
}

// Per-hint-type reflection questions
const REFLECTION_QUESTIONS: Record<'plan' | 'debug' | 'optimize', string> = {
  plan: 'Considering the program you wrote and the feedback you have received from the system so far, what do you think is a possible issue with the program plan and problem-solving steps?',
  debug: 'Considering the program you wrote and the feedback you have received from the system so far, what do you think is a possible bug in the program?',
  optimize: 'Considering the program you wrote and the feedback you have received from the system so far, what do you think is a possible issue with the program in terms of performance and readability?',
};

export default function App() {
  // Separate input field state from the committed Student ID to avoid triggering effects while typing
  const [studentIdInput, setStudentIdInput] = useState('');
  const [studentId, setStudentId] = useState('');
  type Phase = 'enter' | 'ready' | 'loading';
  const [phase, setPhase] = useState<Phase>('enter');
  const [studentEmail, setStudentEmail] = useState('');
  const [problems, setProblems] = useState<ProgrammingProblem[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<string | null>(null);
  const [code, setCode] = useState<string>('# Write your Python solution here\n');
  const [execResult, setExecResult] = useState<ExecuteProgramResponse | null>(null);
  const [execError, setExecError] = useState<string | null>(null);
  const [execLoading, setExecLoading] = useState<boolean>(false);
  const [problemDescription, setProblemDescription] = useState<string | null>(null);
  const [problemDescriptionLoading, setProblemDescriptionLoading] = useState<boolean>(false);
  const [problemDescriptionError, setProblemDescriptionError] = useState<string | null>(null);

  const [hintHistory, setHintHistory] = useState<HistoricHintItem[]>([]);
  const [pendingHints, setPendingHints] = useState<PendingAIHint[]>([]);
  // active hint selection: keep both type and id to avoid collisions between
  // AI hint ids and instructor-feedback ids (they share numeric PKs).
  const [activeHintRef, setActiveHintRef] = useState<{ type: 'ai' | 'instructor'; id: number } | null>(null);
  const [polling, setPolling] = useState<boolean>(false);

  // Keep a ref of currently-pending request IDs so in-flight poll responses
  // can be ignored if the user cancelled the request (pendingHints cleared).
  const pendingReqIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    pendingReqIdsRef.current = new Set(pendingHints.map((p) => p.request_id));
  }, [pendingHints]);
  const [requestingType, setRequestingType] = useState<string | null>(null);
  const [showReflectionModal, setShowReflectionModal] = useState<boolean>(false);
  const [reflectionAnswer, setReflectionAnswer] = useState<string>('');
  const [reflectionPendingReq, setReflectionPendingReq] = useState<PendingAIHint | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<'success' | 'error' | 'info'>('info');
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [showHintHelp, setShowHintHelp] = useState(false);
  const [hasEverRequested, setHasEverRequested] = useState<boolean | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentPendingType, setConsentPendingType] = useState<'plan' | 'debug' | 'optimize' | null>(null);
  const [consentGivenLocal, setConsentGivenLocal] = useState(false);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const formatProblemId = (id: string) => id
    .split('_')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

  // Register global API error handler
  useEffect(() => {
    setApiErrorHandler(({ status, message }) => {
      setToastVariant('error');
      setToastMsg(message || (status ? `Request failed (${status})` : 'Request failed'));
      // auto-hide after 4s
      setTimeout(() => setToastMsg(null), 4000);
    });
  }, []);

  const handleEnter = () => {
    const id = studentIdInput.trim();
    if (!id) return;
    setStudentId(id);
    setPhase('ready');
    // Fetch whether this student has ever requested a hint before
    (async () => {
      try {
        const resp = await fetchHasEverRequested(id);
        setHasEverRequested(!!resp.ever_requested);
      } catch (e) {
        // If the endpoint fails, treat as unknown (null) and default to showing consent
        setHasEverRequested(null);
        console.warn('Failed to fetch hasEverRequested', e);
      }
    })();
  };

  // Load problems on mount
  useEffect(() => {
    logInfo('UI', 'problems:load:start');
    withTiming('UI', 'problems:load', async () => {
      const list = await fetchProblems();
      logDebug('UI', 'problems:load:raw', list);
      setProblems(list);
      if (!list.length) {
        logWarn('UI', 'problems:empty');
      } else {
        // Auto-select first if none selected yet
        setSelectedProblem(prev => prev || list[0].problem_id);
      }
    }).catch(e => logError('UI', 'problems:load:error', e));
  }, []);

  // Load stored code when problem changes
  useEffect(() => {
    if (!selectedProblem) return;
    logInfo('UI', 'code:restore:start', { selectedProblem, studentId });
    const key = `code:${studentId || '_'}:${selectedProblem}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      logDebug('UI', 'code:restore:hit', { key, length: saved.length });
      setCode(saved);
    } else {
      logDebug('UI', 'code:restore:miss', { key });
    }
  }, [selectedProblem, studentId]);

  // Fetch problem description and quota when selectedProblem or studentId changes
  useEffect(() => {
    if (!selectedProblem) { setProblemDescription(null); setQuota(null); return; }
    setProblemDescriptionLoading(true);
    setProblemDescriptionError(null);
    Promise.all([
      fetchSingleProblem(selectedProblem),
      studentId ? fetchQuotaLeft(studentId, selectedProblem) : Promise.resolve(null),
    ])
      .then(([problem, quotaInfo]) => {
        setProblemDescription(problem.task_description || null);
        setQuota((quotaInfo as QuotaInfo) || null);
        // Pre-fill template code ONLY if user has not already written/saved code for this (student,problem)
        const storageKey = `code:${studentId || '_'}:${selectedProblem}`;
        const existing = localStorage.getItem(storageKey);
        if ((existing === null || existing.trim() === '' || existing === '# Write your Python solution here\n') && problem.template_code) {
          logInfo('UI', 'template:apply', { problem: selectedProblem, length: problem.template_code.length });
          setCode(problem.template_code);
          try { localStorage.setItem(storageKey, problem.template_code); } catch { }
        } else {
          logDebug('UI', 'template:skip', { reason: existing ? 'existing-code' : 'no-template' });
        }
      })
      .catch((e) => {
        setProblemDescriptionError(e?.message || 'Failed loading description');
        setProblemDescription(null);
      })
      .finally(() => setProblemDescriptionLoading(false));
  }, [selectedProblem, studentId]);

  // Persist code debounced
  useEffect(() => {
    if (!selectedProblem) return;
    const key = `code:${studentId || '_'}:${selectedProblem}`;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(key, code);
        logDebug('UI', 'code:persist', { key, length: code.length });
      } catch (e) {
        logError('UI', 'code:persist:error', (e as any)?.message);
      }
    }, 500);
    return () => clearTimeout(id);
  }, [code, selectedProblem, studentId]);

  // Polling logic: every 5s poll each pending hint
  usePolling(() => {
    if (!pendingHints.length) return; // nothing to poll
    pendingHints.forEach((ph: PendingAIHint) => {
      logDebug('HINT', 'poll:start', ph);
      pollAIHint(ph.request_id)
        .then((status) => {
          // If user cancelled and removed this request from pendingHints,
          // ignore this late response.
          if (!pendingReqIdsRef.current.has(ph.request_id)) {
            logInfo('HINT', 'poll:ignored-late-result', { request_id: ph.request_id });
            return;
          }
          if (status.job_finished) {
            const hintText = status.returned_hint ?? (status as any).hint ?? null;
            // If backend omits 'successful', treat as success if we have hint text
            const consideredSuccess = status.successful !== false && !!hintText;
            if (consideredSuccess) {
              logInfo('HINT', 'poll:finished-success', status);
            } else {
              logWarn('HINT', 'poll:finished-failure', status);
              // Return consumed quota on failure
              adjustQuotaLeft(ph.type, +1);
            }
            setHintHistory((prev: HistoricHintItem[]) => [
              ...prev,
              {
                id: status.request_id,
                ai_request_id: status.request_id,
                type: 'ai',
                subtype: ph.type,
                created_at: ph.created_at,
                content: hintText || (consideredSuccess ? '(empty hint)' : '(Hint generation failed)')
              },
            ]);
            // Remove from pending and potentially stop polling
            setPendingHints((p: PendingAIHint[]) => {
              const next = p.filter((h) => h.request_id !== ph.request_id);
              if (next.length === 0) {
                logInfo('HINT', 'poll:all-finished');
                setPolling(false);
              }
              return next;
            });
            setActiveHintRef({ type: 'ai', id: status.request_id });
          } else {
            logDebug('HINT', 'poll:pending', status);
          }
        })
        .catch((err) => {
          // If the request was cancelled, ignore errors for it as well
          if (!pendingReqIdsRef.current.has(ph.request_id)) {
            logInfo('HINT', 'poll:error-ignored-after-cancel', { request_id: ph.request_id });
            return;
          }
          logError('HINT', 'poll:error', { request_id: ph.request_id, error: err?.message });
          // Return consumed quota on polling error
          adjustQuotaLeft(ph.type, +1);
          // Treat error as terminal for that request to avoid infinite polling loop
          setHintHistory((prev: HistoricHintItem[]) => [
            ...prev,
            {
              id: ph.request_id,
              ai_request_id: ph.request_id,
              type: 'ai',
              subtype: ph.type,
              created_at: ph.created_at,
              content: '(Error fetching hint)'
            },
          ]);
          setPendingHints((p: PendingAIHint[]) => {
            const next = p.filter((h) => h.request_id !== ph.request_id);
            if (next.length === 0) {
              logInfo('HINT', 'poll:all-finished-after-error');
              setPolling(false);
            }
            return next;
          });
          setActiveHintRef({ type: 'ai', id: ph.request_id });
        });
    });
  }, 5000, polling);

  const activeHint = useMemo<HistoricHintItem | null>(() => {
    if (!activeHintRef) return null;
    return hintHistory.find((h: HistoricHintItem) => h.type === activeHintRef.type && h.id === activeHintRef.id) || null;
  }, [hintHistory, activeHintRef]);

  const canRequestHint = !!studentId && !!selectedProblem;

  // When a new problem is selected, clear previous execution results so the
  // output box doesn't show stale information for the new problem.
  const handleSelectProblem = (id: string | null) => {
    setSelectedProblem(id);
    setExecResult(null);
    setExecError(null);
  };

  // Optimistically adjust local quota-left counts for a hint type and overall.
  // Use delta -1 when creating a request, +1 when a request ultimately fails.
  const adjustQuotaLeft = (type: 'plan' | 'debug' | 'optimize', delta: number) => {
    setQuota((prev) => {
      if (!prev) return prev;
      const nextLeft = { ...prev.left };
      const apply = (val: number | null | undefined) =>
        typeof val === 'number' ? Math.max(0, val + delta) : (val ?? null);
      nextLeft[type] = apply(nextLeft[type]) as any;
      nextLeft.overall = apply(nextLeft.overall) as any;
      return { ...prev, left: nextLeft };
    });
  };

  const handleExecute = async () => {
    if (!selectedProblem) return;
    setExecError(null);
    setExecResult(null); // clear previous output
    setExecLoading(true);
    try {
      logInfo('EXEC', 'run:start', { problem: selectedProblem, size: code.length });
      const resp = await withTiming('EXEC', 'run', () => executeProgram(selectedProblem, code, studentId || undefined));
      logInfo('EXEC', 'run:result', resp);
      setExecResult(resp);
    } catch (e: any) {
      const msg = e?.message || 'Execution failed';
      logError('EXEC', 'run:error', msg);
      setExecError(msg);
    } finally {
      setExecLoading(false);
    }
  };

  const startAIHintRequest = async (hintType: 'plan' | 'debug' | 'optimize') => {
    if (!canRequestHint) return;
    setRequestingType(hintType);
    // If this student has never requested before and we don't have local consent, show consent modal
    if (!consentGivenLocal && hasEverRequested !== true) {
      setConsentPendingType(hintType);
      setShowConsentModal(true);
      setRequestingType(null);
      return;
    }

    try {
      logInfo('HINT', 'request:start', { type: hintType, problem: selectedProblem });
      const created = await withTiming('HINT', 'request', () => addAIHintRequest(studentId, selectedProblem!, hintType, code));
      logInfo('HINT', 'request:created', created);
      // Decrement quota immediately for responsive UI
      adjustQuotaLeft(hintType, -1);
      const ph: PendingAIHint = { request_id: created.request_id, type: hintType, created_at: new Date().toISOString() };
      setReflectionPendingReq(ph);
      setShowReflectionModal(true);
    } catch (e) {
      logError('HINT', 'request:error', (e as any)?.message);
      setRequestingType(null);
    }
  };

  const onConsent = async (consent: boolean) => {
    setShowConsentModal(false);
    if (!consent) {
      // Cancelled by user
      setConsentPendingType(null);
      return;
    }
    // Remember consent for this session so we don't ask again
    setConsentGivenLocal(true);
    setHasEverRequested(true);
    const pending = consentPendingType;
    setConsentPendingType(null);
    if (!pending) return;
    // Proceed with original request
    startAIHintRequest(pending);
  };

  const submitReflection = async () => {
    if (!reflectionPendingReq) return;
    try {
      logInfo('HINT', 'reflection:start', { request_id: reflectionPendingReq.request_id });
      const reflectionQuestion = REFLECTION_QUESTIONS[reflectionPendingReq.type];
      await withTiming('HINT', 'reflection', () => addReflection(reflectionPendingReq.request_id, reflectionQuestion, reflectionAnswer || ''));
      logInfo('HINT', 'reflection:submitted', { request_id: reflectionPendingReq.request_id });
      // start polling this hint
      setPendingHints((prev: PendingAIHint[]) => [...prev, reflectionPendingReq]);
      setPolling(true);
    } catch (e) {
      logError('HINT', 'reflection:error', (e as any)?.message);
    } finally {
      setShowReflectionModal(false);
      setReflectionAnswer('');
      setReflectionPendingReq(null);
      setRequestingType(null);
    }
  };

  const rateHelpful = async () => {
    if (!activeHint) return;
    // Mark helpful and hide overlay (AI) or record instructor rating
    if (activeHint.type === 'ai') {
      logInfo('HINT', 'rate:helpful', { id: activeHint.id });
      setHintHistory((prev: HistoricHintItem[]) => prev.map((h: HistoricHintItem) => h.id === activeHint.id ? { ...h, helpful: true } : h));
      try { await saveHintRating(activeHint.id, true); } catch (e: any) { logError('HINT', 'rate:helpful:save-failed', (e as any)?.message); }
    } else {
      logInfo('INSTRUCTOR', 'rate:helpful', { id: activeHint.id });
      setHintHistory((prev: HistoricHintItem[]) => prev.map((h: HistoricHintItem) => h.id === activeHint.id ? { ...h, instructor_helpful: true } : h));
      try { await saveInstructorFeedbackRating(activeHint.id, true); } catch (e: any) { logError('INSTRUCTOR', 'rate:helpful:save-failed', (e as any)?.message); }
    }
    setActiveHintRef(null);
  };

  const rateUnhelpful = async () => {
    if (!activeHint) return;
    if (activeHint.type === 'ai') {
      logInfo('HINT', 'rate:unhelpful', { id: activeHint.id });
      setHintHistory((prev: HistoricHintItem[]) => prev.map((h: HistoricHintItem) => h.id === activeHint.id ? { ...h, helpful: false } : h));
      try { await saveHintRating(activeHint.id, false); } catch (e: any) { logError('HINT', 'rate:unhelpful:save-failed', (e as any)?.message); }
      // Keep overlay visible and allow escalation for AI
    } else {
      logInfo('INSTRUCTOR', 'rate:unhelpful', { id: activeHint.id });
      setHintHistory((prev: HistoricHintItem[]) => prev.map((h: HistoricHintItem) => h.id === activeHint.id ? { ...h, instructor_helpful: false } : h));
      try { await saveInstructorFeedbackRating(activeHint.id, false); } catch (e: any) { logError('INSTRUCTOR', 'rate:unhelpful:save-failed', (e as any)?.message); }
      // For instructor feedback, just close the overlay (no escalation flow)
      setActiveHintRef(null);
    }
  };

  const escalateToInstructor = async (notes: string) => {
    if (!activeHint) return;
    try {
      // Validate email: allow empty or valid; block if invalid
      if (studentEmail && !emailRegex.test(studentEmail)) {
        setToastVariant('error');
        setToastMsg('Your email is invalid. Please correct it.');
        setTimeout(() => setToastMsg(null), 3500);
        return;
      }
      logInfo('INSTRUCTOR', 'escalate:start', { ai_request_id: activeHint.id });
      await withTiming('INSTRUCTOR', 'escalate', () => requestInstructorFeedback(activeHint.id, studentEmail || undefined, notes));
      logInfo('INSTRUCTOR', 'escalate:submitted', { ai_request_id: activeHint.id });
      // Toast success & close the overlay
      setToastVariant('success');
      setToastMsg('Instructor escalation sent successfully.');
      setTimeout(() => setToastMsg(null), 4000);
      setActiveHintRef(null);
    } catch (e) {
      logError('INSTRUCTOR', 'escalate:error', (e as any)?.message);
      setToastVariant('error');
      setToastMsg((e as any)?.message || 'Failed to escalate to instructor.');
      setTimeout(() => setToastMsg(null), 4000);
    }
  };

  // Load historic hints/feedback when problem or student changes
  useEffect(() => {
    if (!studentId || !selectedProblem) return;
    logInfo('HISTORY', 'load:start', { studentId, selectedProblem });
    Promise.all([
      queryAllAIHints(studentId, selectedProblem),
      queryAllInstructorFeedback(studentId, selectedProblem)
    ]).then(([ai, fb]) => {
      const aiItems: HistoricHintItem[] = (ai || []).map((a: any) => ({
        id: a.request_id || a.id,
        ai_request_id: a.request_id || a.id,
        type: 'ai',
        subtype: a.hint_type || a.type,
        created_at: a.returned_time || a.created_at || new Date().toISOString(),
        content: a.returned_hint || a.hint,
        helpful: (a.is_hint_helpful !== undefined ? a.is_hint_helpful : a.helpful) ?? null,
      }));
      const fbItems: HistoricHintItem[] = (fb || []).map((f: any) => ({
        id: f.instructor_request_id || f.id,
        ai_request_id: f.ai_hint_request_id || undefined,
        type: 'instructor',
        created_at: f.created_at || new Date().toISOString(),
        content: f.instructor_feedback || f.feedback,
        instructor_helpful: (f.is_feedback_helpful !== undefined ? f.is_feedback_helpful : f.helpful) ?? null,
      }));
      const allItems: HistoricHintItem[] = [...aiItems, ...fbItems];
      setHintHistory(allItems);
      // Decide earliest unrated item across AI and instructor
      try {
        const unrated = allItems
          .filter((it) => (it.type === 'ai' ? (it.helpful === null || it.helpful === undefined) : (it.instructor_helpful === null || it.instructor_helpful === undefined)))
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (unrated.length > 0) setActiveHintRef({ type: unrated[0].type as 'ai' | 'instructor', id: unrated[0].id });
      } catch { }
      logInfo('HISTORY', 'load:success', { aiCount: aiItems.length, fbCount: fbItems.length });
    }).catch(e => console.warn('Failed loading history', e));
  }, [studentId, selectedProblem]);

  const overlayVisible = !!activeHint;
  // (Removed escalation staging logic; escalation always available post-Unhelpful now.)

  // Auto-select earliest unrated (AI or instructor) when no active overlay is shown
  useEffect(() => {
    if (activeHintRef !== null) return;
    if (!hintHistory.length) return;
    try {
      const unrated = hintHistory
        .filter((it) => (it.type === 'ai' ? (it.helpful === null || it.helpful === undefined) : (it.instructor_helpful === null || it.instructor_helpful === undefined)))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (unrated.length > 0) setActiveHintRef({ type: unrated[0].type as 'ai' | 'instructor', id: unrated[0].id });
    } catch { }
  }, [hintHistory, activeHintRef]);

  return (
    <div className={`min-h-screen flex flex-col transition-[padding] duration-300`} style={overlayVisible ? { paddingTop: `${HINT_OVERLAY_VH}vh` } : undefined}>
      {phase === 'enter' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white shadow rounded p-6 w-full max-w-md">
            <p className="mb-4 text-gray-700">Enter your student ID</p>
            <div className="flex items-center gap-2">
              <input
                className="border rounded px-3 py-2 w-64 focus:outline-none focus:ring focus:border-blue-300"
                placeholder="Student ID"
                value={studentIdInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStudentIdInput(e.target.value)}
              />
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                onClick={handleEnter}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
      {phase !== 'enter' && (
        <>
          {toastMsg && (
            <div
              className={`fixed top-3 right-3 z-50 text-sm px-3 py-2 rounded border shadow-sm transition-colors
            ${toastVariant === 'success'
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                  : toastVariant === 'error'
                    ? 'bg-rose-100 border-rose-300 text-rose-900'
                    : 'bg-gray-100 border-gray-300 text-gray-800'
                }`}
            >
              {toastMsg}
            </div>
          )}
          <HintOverlay
            visible={overlayVisible}
            currentHint={activeHint}
            onHelpful={rateHelpful}
            onUnhelpful={rateUnhelpful}
            onEscalate={escalateToInstructor}
            loading={pendingHints.length > 0}
            onDismiss={() => { setActiveHintRef(null); }}
            studentEmail={studentEmail}
            isStudentEmailValid={!!studentEmail && emailRegex.test(studentEmail)}
          />
          <main className="flex-1 container mx-auto px-4 pb-16">
            {/* Header: Title centered, Student ID at right */}
            <div className="flex items-center justify-between mt-4 mb-4">
              <div className="flex-1" />
              <h1 className="text-2xl font-semibold text-center flex-2">Student Programming Environment</h1>
              <div className="flex-1 flex justify-end text-sm text-gray-600">Student ID: <span className="ml-1 font-medium">{studentId}</span></div>
            </div>

            {/* Row: Email + Problem selector (right-aligned) */}
            <div className="flex justify-end gap-4 mb-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">Email</label>
                <input
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  placeholder="name@example.com"
                  type="email"
                  className={`border rounded px-2 h-10 ${studentEmail && !emailRegex.test(studentEmail) ? 'bg-rose-50' : 'bg-white'}`}
                />
              </div>
              <ProblemSelector problems={problems} selected={selectedProblem} onSelect={handleSelectProblem} />
            </div>

            {/* Problem title + description */}
            {selectedProblem && (
              <div className="mb-4">
                <div className="text-lg md:text-xl font-semibold mb-1">{(problems.find(p => p.problem_id === selectedProblem)?.name?.trim().length ? problems.find(p => p.problem_id === selectedProblem)!.name : formatProblemId(selectedProblem))}</div>
                <div className="text-xs whitespace-pre-wrap leading-relaxed">
                  {problemDescriptionLoading && <span className="italic text-gray-500">Loading description...</span>}
                  {problemDescriptionError && <span className="text-red-600">{problemDescriptionError}</span>}
                  {!problemDescriptionLoading && !problemDescriptionError && (problemDescription || <span className="text-gray-400">No description available.</span>)}
                </div>
              </div>
            )}

            {/* Code editor */}
            <div
              className="rounded overflow-hidden mb-4 relative"
            >
              <Editor
                height="50vh"
                defaultLanguage="python"
                theme="vs-dark"
                value={code}
                onChange={(v) => setCode(v || '')}
                options={{ fontSize: 14, minimap: { enabled: false }, readOnly: !studentId }}
              />
              {!studentId && (
                <div
                  className="absolute inset-0 cursor-not-allowed"
                  title="Enter a Student ID to edit and run code."
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Run button (25%) and Code output (75%), same height */}
            <div className="grid grid-cols-4 gap-4 items-stretch mb-4">
              <div className="col-span-4 md:col-span-1 flex">
                <button
                  onClick={handleExecute}
                  disabled={!selectedProblem || !studentId || execLoading}
                  title={!studentId ? 'Enter a Student ID to run code.' : undefined}
                  className="w-full px-3 rounded bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white text-sm flex items-center justify-center"
                >
                  {execLoading && <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2" />}
                  {execLoading ? 'Running…' : 'Run Code'}
                </button>
              </div>
              <div className="col-span-4 md:col-span-3 text-xs border rounded p-2 bg-white flex items-start min-h-[5rem]">
                <div>
                  {execLoading ? (
                    <div className="flex items-center text-gray-700">
                      <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                      Running program…
                    </div>
                  ) : execResult ? (
                    <div>
                      <div><strong>Correctness:</strong> {String(execResult.correctness)}</div>
                      {execResult.buggy_output && <pre className="mt-1 whitespace-pre-wrap text-red-600 text-[11px] max-h-32 overflow-auto">{execResult.buggy_output}</pre>}
                    </div>
                  ) : (
                    <span className="text-gray-400">Code output will appear here.</span>
                  )}
                  {execError && <div className="text-xs text-red-600 mt-2">{execError}</div>}
                </div>
              </div>
            </div>

            {/* Request Hint header with help button and hint buttons row */}
            <div className="mb-2 flex items-center gap-3">
              <span className="text-sm font-medium">Request Hint</span>
              <button
                onClick={() => setShowHintHelp(true)}
                disabled={!studentId}
                className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-gray-800 text-xs font-bold flex items-center justify-center"
                title={!studentId ? 'Enter a Student ID to view hint type help.' : undefined}
              >
                ?
              </button>
              <div className="flex-1">
                {polling && pendingHints.length > 0 ? (
                  (() => {
                    const current = pendingHints[pendingHints.length - 1];
                    const label = current?.type === 'plan' ? 'Planning Hint' : current?.type === 'debug' ? 'Debugging Hint' : 'Optimization Hint';
                    return (
                      <div className="flex justify-center items-center gap-2">
                        <div className="flex items-center rounded py-1.5 px-2 text-sm text-gray-700 whitespace-nowrap">
                          <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                          Requesting for {label}
                        </div>
                        <div>
                          <button
                            onClick={async () => {
                              // Stop waiting locally and keep quota counts unchanged
                              setPolling(false);
                              setRequestingType(null);
                              setReflectionPendingReq(null);
                              // Mark all currently-pending requests as cancelled on backend
                              try {
                                const ids = pendingHints.map(p => p.request_id);
                                await Promise.all(ids.map(id => cancelAIHintRequest(id).catch(() => { })));
                              } catch { }
                              setPendingHints([]);
                              // Toast info
                              setToastVariant('info');
                              setToastMsg('Hint request canceled');
                              setTimeout(() => setToastMsg(null), 2500);
                            }}
                            className="px-3 py-1.5 text-sm rounded bg-gray-200 hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <HintButtons
                    disabled={!canRequestHint || overlayVisible}
                    onRequest={startAIHintRequest}
                    loadingType={requestingType}
                    planLeft={quota?.left.plan ?? undefined}
                    debugLeft={quota?.left.debug ?? undefined}
                    optimizeLeft={quota?.left.optimize ?? undefined}
                    disabledReason={(() => {
                      if (overlayVisible) return 'A hint is not rated. Rate it to request another.';
                      if (!studentId) return 'Enter a Student ID to request a hint.';
                      if (!selectedProblem) return 'Select a problem to request a hint.';
                      return undefined;
                    })()}
                  />
                )}
              </div>
            </div>
            {quota?.left.overall !== null && quota?.left.overall !== undefined && (
              <div className="text-[11px] text-gray-600 mb-4">Overall hints left: <strong>{quota.left.overall}</strong></div>
            )}

            {/* History */}
            <div>
              <h2 className="text-sm font-semibold mb-2">Hint and Feedback History</h2>
              <HistoryList items={hintHistory} />
            </div>
          </main>

          {showReflectionModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded shadow-lg w-full max-w-md p-4 space-y-3">
                <h2 className="font-semibold">Reflection</h2>
                <p className="text-xs text-gray-600">{reflectionPendingReq ? REFLECTION_QUESTIONS[reflectionPendingReq.type] : ''}</p>
                <textarea value={reflectionAnswer} onChange={e => setReflectionAnswer(e.target.value)} className="w-full border rounded p-2 h-32 text-sm" placeholder="Your reflection..." />
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setShowReflectionModal(false); setReflectionPendingReq(null); setRequestingType(null); }} className="px-3 py-1.5 text-sm rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
                  <button disabled={!reflectionPendingReq} onClick={submitReflection} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500">Submit</button>
                </div>
              </div>
            </div>
          )}

          {showConsentModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded shadow-lg w-full max-w-lg p-4">
                <h2 className="font-semibold">Consent</h2>
                <p className="text-sm text-gray-700 mt-2">The hinting features in this notebook are a part of a research prototype with the purpose of supporting your learning. It is completely optional to use these features, press cancel if you do not wish to use this prototype.</p>
                <p className="text-sm text-gray-700 mt-2">When you request a hint this prototype takes your program, as well as other contextual information you might provide, and uses external/third party large language model services for analysis. Hints may be incorrect, incomplete, or misleading, and you are encouraged to critically evaluate responses before modifying your program.</p>
                <p className="text-sm text-gray-700 mt-2">If you have questions about the system, contact the instructional team.</p>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => onConsent(false)} className="px-3 py-1.5 text-sm rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
                  <button onClick={() => onConsent(true)} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500">Consent</button>
                </div>
              </div>
            </div>
          )}

          {showHintHelp && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded shadow-lg w-full max-w-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Hint Types</h2>
                  <button onClick={() => setShowHintHelp(false)} className="px-2 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300">Close</button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="grid grid-cols-[auto,1fr] gap-2 items-start">
                    <div>
                      <button disabled className="w-40 px-3 py-1.5 rounded font-medium shadow-sm text-sm bg-sky-300 text-black-900">Planning Hint</button>
                    </div>
                    <div className="text-sm text-gray-700">A hint aimed at helping you to identify the steps needed to solve the question.</div>
                  </div>
                  <div className="grid grid-cols-[auto,1fr] gap-2 items-start">
                    <div>
                      <button disabled className="w-40 px-3 py-1.5 rounded font-medium shadow-sm text-sm bg-rose-300 text-black-900">Debugging Hint</button>
                    </div>
                    <div className="text-sm text-gray-700">A hint aimed at helping you to identify and fix a bug in your current program.</div>
                  </div>
                  <div className="grid grid-cols-[auto,1fr] gap-2 items-start">
                    <div>
                      <button disabled className="w-40 px-3 py-1.5 rounded font-medium shadow-sm text-sm bg-green-300 text-black-900">Optimization Hint</button>
                    </div>
                    <div className="text-sm text-gray-700">A hint aimed at helping you to optimize your current program for better performance and readability.</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
