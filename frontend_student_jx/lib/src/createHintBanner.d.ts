import { NotebookPanel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';
import { IJupyterLabPioneer } from 'jupyterlab-pioneer';
export declare const createHintBanner: (notebookPanel: NotebookPanel, pioneer: IJupyterLabPioneer, cell: ICellModel, cellIndex: number, promptGroup: string, prompt: string, uuid: string, preReflection: string, hintType: string, requestId: string, options?: {
    preloadedContent?: string;
    skipNetwork?: boolean;
}) => Promise<void>;
