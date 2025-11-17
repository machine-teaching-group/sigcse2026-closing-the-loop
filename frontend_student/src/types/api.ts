export interface ProgrammingProblem {
  problem_id: string;
  name?: string; // Human-friendly name (optional)
  task_description?: string;
  task_description_error?: string;
  template_code?: string;
  template_code_error?: string;
}

export interface ExecuteProgramResponse {
  problem_id: string;
  correctness: boolean;
  buggy_output: string | null;
  elapsed_time: number;
  error?: string;
}

export interface AIHintRequestCreated {
  request_id: number;
}

export interface AIHintStatusResponse {
  request_id: number;
  job_finished: boolean;
  successful?: boolean; // backend may omit; treat undefined as success if hint present
  returned_hint?: string | null;
  hint?: string | null; // some backend variants may use 'hint'
}

export interface InstructorFeedback {
  instructor_request_id: number;
  job_finished: boolean;
  feedback: string | null;
  is_feedback_helpful?: boolean | null;
  created_at?: string;
}

export interface HistoricHintItem {
  id: number; // AI hint request id or instructor_feedback id (namespaced via type)
  type: 'ai' | 'instructor';
  subtype?: 'plan' | 'debug' | 'optimize';
  created_at: string; // ISO time
  content?: string | null; // hint text or feedback text
  helpful?: boolean | null; // rating for AI hint
  ai_request_id?: number; // underlying AI hint request id for grouping/sorting
  instructor_helpful?: boolean | null; // rating for instructor feedback
}

export interface QuotaInfo {
  student_id: string;
  problem_id: string;
  limits: { overall: number | null; plan: number | null; debug: number | null; optimize: number | null };
  used: { overall: number; plan: number; debug: number; optimize: number };
  left: { overall: number | null; plan: number | null; debug: number | null; optimize: number | null };
}
