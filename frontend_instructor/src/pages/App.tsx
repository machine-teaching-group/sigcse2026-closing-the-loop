import { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import NotebookViewer from '../components/NotebookViewer';
import { fetchInstructorRequest, saveInstructorFeedback, InstructorFetchResponse, executeProgram, ExecuteProgramResponse } from '../lib/api';

function titleCaseProblemId(pid: string) {
  return pid.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapHintType(raw: string | null | undefined) {
  if (!raw) return '—';
  switch (raw.toLowerCase()) {
    case 'plan': return 'Planning';
    case 'debug': return 'Debugging';
    case 'optimize': return 'Optimization';
    default: return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
}

type Phase = 'enter' | 'loading' | 'ready' | 'frozen' | 'empty';

export default function App() {
  const [instructorId, setInstructorId] = useState('');
  const [phase, setPhase] = useState<Phase>('enter');
  const [current, setCurrent] = useState<InstructorFetchResponse | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // new: code editing + exec states
  const [editorCode, setEditorCode] = useState<string>('');
  const [execLoading, setExecLoading] = useState<boolean>(false);
  const [execResult, setExecResult] = useState<ExecuteProgramResponse | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const handleEnter = async () => {
    const id = instructorId.trim();
    if (!id) return;
    setPhase('loading');
    setError(null);
    try {
      const req = await fetchInstructorRequest(id);
      if (!req) {
        setPhase('empty');
        setCurrent(null);
      } else {
        setCurrent(req);
        setFeedback('');
        setEditorCode(req.student_program || '');
        setExecResult(null);
        setExecError(null);
        setPhase('ready');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch request');
      setPhase('enter');
    }
  };

  const formattedProblem = useMemo(() => {
    if (!current) return '';
    const nm = (current as any).name as string | undefined;
    return nm && nm.trim().length > 0 ? nm : titleCaseProblemId(current.problem_id);
  }, [current]);

  useEffect(() => {}, [current?.problem_id]);

  const onSubmitFeedback = async () => {
    if (!current) return;
    const text = feedback.trim();
    if (!text) {
      alert('Feedback cannot be empty.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await saveInstructorFeedback(current.instructor_request_id, instructorId, text);
      setPhase('frozen');
    } catch (e: any) {
      setError(e?.message || 'Failed to save feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const onNext = async () => {
    setPhase('loading');
    setError(null);
    try {
      const req = await fetchInstructorRequest(instructorId);
      if (!req) {
        setPhase('empty');
        setCurrent(null);
        setFeedback('');
        setEditorCode('');
        setExecResult(null);
        setExecError(null);
      } else {
        setCurrent(req);
        setFeedback('');
        setEditorCode(req.student_program || '');
        setExecResult(null);
        setExecError(null);
        setPhase('ready');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch next request');
      setPhase('ready');
    }
  };

  const onResetCode = () => {
    if (!current) return;
    setEditorCode(current.student_program || '');
  };

  const onRunCode = async () => {
    if (!current) return;
    setExecError(null);
    setExecResult(null);
    setExecLoading(true);
    try {
      const result = await executeProgram(current.problem_id, editorCode);
      setExecResult(result);
    } catch (e: any) {
      setExecError(e?.message || 'Execution failed');
    } finally {
      setExecLoading(false);
    }
  };

  const onDownloadNotebook = () => {
    if (!current || !current.student_notebook) return;
    let content = '';
    const raw = current.student_notebook as any;
    if (typeof raw === 'string') {
      // Try pretty-printing if it's valid JSON; otherwise use as-is
      try {
        content = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        content = raw;
      }
    } else {
      try {
        content = JSON.stringify(raw, null, 2);
      } catch {
        content = String(raw);
      }
    }
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const base = current.problem_id ? `${current.problem_id}_student_notebook` : 'student_notebook';
    a.href = url;
    a.download = `${base}.ipynb`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const hasNotebook = !!current?.student_notebook;

  return (
    <div className={`min-h-screen ${phase === 'frozen' ? 'screen-freeze' : ''}`}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {phase === 'enter' && (
          <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
            <div className="bg-white shadow rounded p-6">
              <p className="mb-4 text-gray-700">Enter your instructor ID</p>
              <div className="flex items-center gap-2">
                <input
                  className="border rounded px-3 py-2 w-64 focus:outline-none focus:ring focus:border-blue-300"
                  placeholder="Instructor ID"
                  value={instructorId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInstructorId(e.target.value)}
                />
                <button
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
                  onClick={handleEnter}
                >
                  Submit
                </button>
              </div>
              {error && <p className="text-red-600 mt-3">{error}</p>}
            </div>
          </div>
        )}

        {phase === 'loading' && (
          <div className="text-gray-700">Loading…</div>
        )}

        {phase === 'empty' && (
          <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
            <div className="bg-white shadow rounded p-6 text-center">
              <p className="text-gray-700">No feedback request available. Please come back later.</p>
              <button
                className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
                onClick={onNext}
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        {(phase === 'ready' || phase === 'frozen') && current && (
          <div className="space-y-6">
            {/* Header bar */}
            <div className="flex items-center justify-between">
              <div className="flex-1" />
              <h1 className="text-2xl font-semibold text-center flex-2">Instructor Feedback Interface</h1>
              <div className="flex-1 flex justify-end text-sm text-gray-600">Instructor ID: <span className="ml-1 font-medium">{instructorId}</span></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[59%,39%] gap-4 items-start">
              {/* Left column */}
              <div className="space-y-6">
                <div className="bg-white shadow rounded p-5 space-y-3">
                  {!hasNotebook && (
                    <>
                      <div>
                        <h2 className="text-lg font-semibold">{formattedProblem || 'Problem'}</h2>
                        <div className="mt-2 text-sm whitespace-pre-wrap text-gray-700 min-h-[3rem]">
                          {current?.problem_description ? current.problem_description : <span className="text-gray-400">No description.</span>}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-medium mb-2">Student Program</h3>
                        <div className="h-72 border rounded overflow-hidden">
                          <Editor
                            height="100%"
                            defaultLanguage="python"
                            value={editorCode}
                            onChange={(v) => setEditorCode(v || '')}
                            options={{ readOnly: false, minimap: { enabled: false }, wordWrap: 'on' }}
                          />
                        </div>
                        <div className="mt-3 flex gap-2 justify-end">
                          <button
                            onClick={onResetCode}
                            className="px-3 py-1.5 rounded border bg-gray-100 hover:bg-gray-200 text-sm"
                          >
                            Reset to original
                          </button>
                          <button
                            onClick={onRunCode}
                            disabled={execLoading}
                            className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white text-sm flex items-center"
                          >
                            {execLoading && <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2" />}
                            {execLoading ? 'Running…' : 'Run Code'}
                          </button>
                        </div>
                        {execLoading && (
                          <div className="mt-3 text-sm text-gray-700 flex items-center">
                            <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                            Running program…
                          </div>
                        )}
                        {execResult && (
                          <div className="mt-3 text-sm">
                            <div><strong>Correctness:</strong> {String(execResult.correctness)}</div>
                            {execResult.buggy_output && (
                              <pre className="mt-1 whitespace-pre-wrap text-red-600 text-[11px] max-h-32 overflow-auto">{execResult.buggy_output}</pre>
                            )}
                          </div>
                        )}
                        {execError && (
                          <div className="mt-2 text-xs text-red-600">{execError}</div>
                        )}
                      </div>
                    </>
                  )}
                  {hasNotebook && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-lg font-semibold">Student Notebook</h2>
                        <button
                          onClick={onDownloadNotebook}
                          className="px-3 py-1.5 rounded border border-blue-600 bg-white hover:bg-gray-50 text-sm"
                          title="Download .ipynb"
                        >
                          Download
                        </button>
                      </div>
                      <NotebookViewer notebook={current.student_notebook} />
                    </div>
                  )}
                </div>
              </div>
              {/* Right column */}
              <div className="space-y-3">
                {hasNotebook && (
                  <InfoBlock label="Problem">{formattedProblem || '—'}</InfoBlock>
                )}
                <InfoBlock label="Hint Type">{mapHintType(current.hint_type)}</InfoBlock>
                <InfoBlock label="Reflection Question">{current.reflection_question || '—'}</InfoBlock>
                <InfoBlock label="Student Reflection">{current.reflection_answer || '—'}</InfoBlock>
                <InfoBlock label="AI Hint">{current.ai_hint || '—'}</InfoBlock>
                <InfoBlock label="Student Notes">{current.student_notes || '—'}</InfoBlock>
                <div className="bg-white shadow rounded p-4">
                  <label className="font-medium tracking-wide block mb-2">Your Feedback</label>
                  <textarea
                    className="w-full border rounded p-3 min-h-[100px] focus:outline-none focus:ring"
                    placeholder="Write your feedback here…"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    disabled={phase === 'frozen'}
                  />
                  <div className="mt-3 flex flex-wrap gap-3 items-center justify-end">
                    <button
                      className="bg-yellow-400 hover:bg-yellow-500 text-black font-medium px-4 py-2 rounded disabled:opacity-60"
                      onClick={onSubmitFeedback}
                      disabled={phase === 'frozen' || submitting}
                    >
                      {submitting ? 'Submitting…' : 'Submit'}
                    </button>
                    {phase === 'frozen' && (
                      <button
                        className="relative z-50 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
                        onClick={onNext}
                      >
                        Continue to the next request
                      </button>
                    )}
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// Old Info component removed in favor of column layout

function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white shadow rounded p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className="text-sm whitespace-pre-wrap text-gray-900">{children}</div>
    </div>
  );
}
