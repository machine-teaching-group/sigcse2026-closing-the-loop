import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
export declare class HintConsentWidget extends ReactWidget {
    constructor();
    getValue(): string | undefined;
    protected render(): React.ReactElement<any>;
}
