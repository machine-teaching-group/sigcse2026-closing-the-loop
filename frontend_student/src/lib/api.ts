import axios from 'axios';
import { ProgrammingProblem, ExecuteProgramResponse, AIHintRequestCreated, AIHintStatusResponse, InstructorFeedback, QuotaInfo } from '../types/api';
import { logDebug, logError, logInfo } from './logger';

// Base URL can be configured via env (Vite: VITE_ORCH_BASE_URL) – keep backward compatibility with previous name
// @ts-ignore legacy variable
const ORCH_BASE = import.meta.env.VITE_ORCH_BASE_URL?.replace(/\/+$/, '');

// Attach axios interceptors once
axios.interceptors.request.use((config) => {
  logDebug('HTTP', 'request', { method: config.method, url: config.url, params: config.params, data: config.data });
  return config;
});
type ApiErrorInfo = { status?: number; message: string; url?: string };
let apiErrorHandler: ((info: ApiErrorInfo) => void) | null = null;
export function setApiErrorHandler(fn: (info: ApiErrorInfo) => void) {
  apiErrorHandler = fn;
}

axios.interceptors.response.use(
  (resp) => {
    logDebug('HTTP', 'response', { url: resp.config.url, status: resp.status, data: resp.data });
    return resp;
  },
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url;
    const serverMsg = err.response?.data?.detail || err.response?.data?.error || err.response?.data?.message;
    const message = status === 429
      ? 'Hint request failed: You have reached your hint request limit.'
      : (serverMsg || err.message || 'Request failed');
    logError('HTTP', 'error', { message, url, responseStatus: status, responseData: err.response?.data });
    if (apiErrorHandler) {
      try { apiErrorHandler({ status, message, url }); } catch {}
    }
    return Promise.reject(err);
  }
);

export async function fetchProblems(): Promise<ProgrammingProblem[]> {
  const url = `${ORCH_BASE}/problems/programming_problems/`;
  logInfo('API', 'fetchProblems:start', { url });
  const resp = await axios.get(url);
  const data = resp.data;
  if (!Array.isArray(data)) {
    logError('API', 'fetchProblems:unexpected-shape', { received: data });
    throw new Error('Problems endpoint did not return an array');
  }
  logInfo('API', 'fetchProblems:success', { count: data.length });
  return data as ProgrammingProblem[];
}

export async function fetchSingleProblem(problem_id: string): Promise<ProgrammingProblem> {
  const url = `${ORCH_BASE}/problems/programming_problems/?problem_id=${encodeURIComponent(problem_id)}&include_description=true`;
  logInfo('API', 'fetchSingleProblem:start', { problem_id });
  const resp = await axios.get(url);
  logDebug('API', 'fetchSingleProblem:success', { size: resp.data?.task_description?.length });
  return resp.data as ProgrammingProblem;
}

export async function executeProgram(problem_id: string, student_program: string, student_id?: string) {
  const postUrl = `${ORCH_BASE}/problems/execute_program/`;
  logInfo('EXEC', 'post:start', { problem_id });
  const postResp = await axios.post(postUrl, { problem_id, student_program, student_id });
  const execution_id = postResp.data?.execution_id;
  if (!execution_id) {
    logError('EXEC', 'post:no-execution-id', { data: postResp.data });
    throw new Error('Execution request did not return an execution_id');
  }
  logInfo('EXEC', 'post:ok', { execution_id });

  const pollIntervalMs = 1000;
  const pollUrl = `${ORCH_BASE}/problems/get_execution_result/?execution_id=${encodeURIComponent(execution_id)}`;

  while (true) {
    const resp = await axios.get(pollUrl, { validateStatus: s => s === 200 });
    const data = resp.data as any;
    logDebug('EXEC', 'poll:ticked', { execution_id, job_finished: data?.job_finished });

    if (data?.job_finished === true) {
      if (data?.error) {
        // Treat backend-declared failure as an error for UI handling
        logError('EXEC', 'poll:finished-error', { execution_id, error: data.error });
        throw new Error(data.error);
      }
      const result: ExecuteProgramResponse = {
        problem_id,
        correctness: !!data.correctness,
        buggy_output: (data.buggy_output ?? null) as string | null,
        elapsed_time: typeof data.elapsed_time === 'number' ? data.elapsed_time : Number(data.elapsed_time ?? 0),
      };
      logInfo('EXEC', 'poll:finished-success', { execution_id, correctness: result.correctness });
      return result;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

export async function addAIHintRequest(student_id: string, problem_id: string, hint_type: string, student_program: string) {
  const url = `${ORCH_BASE}/ai_hint/add_request/`;
  const resp = await axios.post(url, { student_id, problem_id, hint_type, student_program });
  return resp.data as AIHintRequestCreated;
}

export async function addReflection(request_id: number, reflection_question: string, reflection_answer: string) {
  const url = `${ORCH_BASE}/ai_hint/add_reflection/`;
  const resp = await axios.post(url, { request_id, reflection_question, reflection_answer });
  return resp.data as { request_id: number };
}

export async function pollAIHint(request_id: number) {
  const url = `${ORCH_BASE}/ai_hint/query_hint/?request_id=${request_id}`;
  const resp = await axios.get(url);
  return resp.data as AIHintStatusResponse;
}

export async function requestInstructorFeedback(ai_request_id: number, student_email?: string, student_notes?: string) {
  const url = `${ORCH_BASE}/instructor_feedback/add_request/`;
  const payload: any = { request_id: ai_request_id };
  if (student_email) payload.student_email = student_email;
  if (student_notes) payload.student_notes = student_notes;
  const resp = await axios.post(url, payload);
  return resp.data;
}

export async function fetchHasEverRequested(student_id: string) {
  const url = `${ORCH_BASE}/ai_hint/has_ever_requested/?student_id=${encodeURIComponent(student_id)}`;
  const resp = await axios.get(url);
  return resp.data as { student_id: string; ever_requested: boolean };
}

export async function queryAllAIHints(student_id: string, problem_id: string) {
  const url = `${ORCH_BASE}/ai_hint/query_all_hint/?student_id=${encodeURIComponent(student_id)}&problem_id=${encodeURIComponent(problem_id)}`;
  const resp = await axios.get(url);
  return resp.data as any[]; // TODO refine type once backend shape known
}

export async function cancelAIHintRequest(request_id: number) {
  const url = `${ORCH_BASE}/ai_hint/cancel_request/`;
  await axios.post(url, { request_id });
  return true;
}

export async function queryAllInstructorFeedback(student_id: string, problem_id: string) {
  const url = `${ORCH_BASE}/instructor_feedback/query_all_feedback/?student_id=${encodeURIComponent(student_id)}&problem_id=${encodeURIComponent(problem_id)}`;
  const resp = await axios.get(url);
  return resp.data as any[];
}

export async function saveHintRating(request_id: number, is_hint_helpful: boolean) {
  const url = `${ORCH_BASE}/ai_hint/save_hint_rating/`;
  await axios.post(url, { request_id, is_hint_helpful });
  return true;
}

export async function saveInstructorFeedbackRating(instructor_request_id: number, is_feedback_helpful: boolean) {
  const url = `${ORCH_BASE}/instructor_feedback/save_feedback_rating/`;
  await axios.post(url, { instructor_request_id, is_feedback_helpful });
  return true;
}

export async function fetchQuotaLeft(student_id: string, problem_id: string) {
  const url = `${ORCH_BASE}/ai_hint/quota_left/?student_id=${encodeURIComponent(student_id)}&problem_id=${encodeURIComponent(problem_id)}`;
  const resp = await axios.get(url);
  return resp.data as QuotaInfo;
}

