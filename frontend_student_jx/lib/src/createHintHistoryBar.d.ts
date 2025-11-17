import { NotebookPanel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';
import { IJupyterLabPioneer } from 'jupyterlab-pioneer';
export declare const checkInstructorFeedback: (cell: ICellModel, notebookPanel: NotebookPanel, pioneer: IJupyterLabPioneer) => Promise<boolean>;
export declare const createHintHistoryBar: (cell: ICellModel, cellIndex: number, notebookPanel: NotebookPanel, pioneer: IJupyterLabPioneer) => Promise<void>;
