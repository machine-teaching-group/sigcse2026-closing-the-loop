import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
export declare class HintTypeSelectionWidget extends ReactWidget {
    constructor();
    getValue(): string | undefined;
    protected render(): React.ReactElement<any>;
}
