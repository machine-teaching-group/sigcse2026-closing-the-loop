import { NotebookPanel } from '@jupyterlab/notebook';
import { IJupyterLabPioneer } from 'jupyterlab-pioneer';
import { ICellModel } from '@jupyterlab/cells';
export declare const requestHint: (notebookPanel: NotebookPanel, pioneer: IJupyterLabPioneer, cell: ICellModel, cellIndex: number, hintType: string, questionId: string, questionEndGradeId: string) => Promise<void>;
