import { NotebookPanel } from '@jupyterlab/notebook';
export type QuotaLeft = {
    student_id: string;
    problem_id: string;
    limits: {
        overall: number | null;
        plan: number | null;
        debug: number | null;
        optimize: number | null;
    };
    used: {
        overall: number;
        plan: number;
        debug: number;
        optimize: number;
    };
    left: {
        overall: number | null;
        plan: number | null;
        debug: number | null;
        optimize: number | null;
    };
};
export declare function syncBudgetsOnOpen(notebookPanel: NotebookPanel): Promise<void>;
