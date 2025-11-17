import axios from 'axios';

export const ORCH_BASE = import.meta.env.VITE_ORCH_BASE_URL?.replace(/\/+$/, '');

export type InstructorFetchResponse = {
  instructor_request_id: number;
  request_id: number;
  problem_id: string;
  name?: string; // optional human-friendly problem name
  hint_type: string;
  student_program: string;
  // If present, a JSON Jupyter Notebook (object or JSON string)
  student_notebook?: any;
  reflection_question: string | null;
  reflection_answer: string | null;
  ai_hint: string | null;
  student_notes: string | null;
  problem_description?: string | null; // Newly provided by backend (optional for backward compat)
};

export type ExecuteProgramResponse = {
  problem_id: string;
  correctness: boolean;
  buggy_output: string | null;
  elapsed_time: number;
};

export async function fetchInstructorRequest(instructor_id: string) {
  const url = `${ORCH_BASE}/instructor_feedback/fetch_request/?instructor_id=${encodeURIComponent(instructor_id)}`;
  const resp = await axios.get(url, { validateStatus: s => s === 200 });
  if (!resp.data || Object.keys(resp.data).length === 0) return null;
  return resp.data as InstructorFetchResponse;
}

export async function saveInstructorFeedback(instructor_request_id: number, instructor_id: string, feedback: string) {
  const url = `${ORCH_BASE}/instructor_feedback/save_feedback/`;
  const resp = await axios.post(url, { instructor_request_id, instructor_id, feedback }, { validateStatus: s => s === 200 || s === 500 || s === 400 });
  if (resp.status !== 200) {
    const message = typeof resp.data === 'string' ? resp.data : 'Failed to save feedback';
    throw new Error(message);
  }
  return true;
}

export async function executeProgram(problem_id: string, student_program: string) {
  // In instructor view, we don't send student_id; we only need problem and code
  const postUrl = `${ORCH_BASE}/problems/execute_program/`;
  const postResp = await axios.post(postUrl, { problem_id, student_program });
  const execution_id = postResp.data?.execution_id;
  if (!execution_id) throw new Error('Execution request did not return an execution_id');

  const pollUrl = `${ORCH_BASE}/problems/get_execution_result/?execution_id=${encodeURIComponent(execution_id)}`;
  const pollIntervalMs = 1000;
  while (true) {
    const resp = await axios.get(pollUrl, { validateStatus: s => s === 200 });
    const data = resp.data as any;
    if (data?.job_finished === true) {
      if (data?.error) throw new Error(data.error);
      const result: ExecuteProgramResponse = {
        problem_id,
        correctness: !!data.correctness,
        buggy_output: (data.buggy_output ?? null) as string | null,
        elapsed_time: typeof data.elapsed_time === 'number' ? data.elapsed_time : Number(data.elapsed_time ?? 0),
      };
      return result;
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
}

