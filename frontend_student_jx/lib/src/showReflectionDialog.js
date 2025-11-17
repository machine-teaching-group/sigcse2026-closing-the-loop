import React from 'react';
import { Dialog, showDialog, ReactWidget } from '@jupyterlab/apputils';
class ReflectionInputWidget extends ReactWidget {
    constructor(message) {
        super();
        this._message = '';
        this._message = message;
    }
    getValue() {
        var _a;
        return (_a = this.node.querySelector('textarea')) === null || _a === void 0 ? void 0 : _a.value;
    }
    render() {
        return (React.createElement("div", { className: "reflection" },
            React.createElement("p", null, this._message),
            React.createElement("textarea", { name: "reflection-input", className: "reflection-input", rows: 10 }),
            React.createElement("p", { style: { fontStyle: 'italic' } }, "Text entered here will be passed to the external language model service to improve hint relevance.")));
    }
}
export const showReflectionDialog = (message) => {
    return showDialog({
        title: 'Reflection',
        body: new ReflectionInputWidget(message),
        buttons: [
            Dialog.cancelButton({
                label: 'Cancel',
                className: 'jp-Dialog-button jp-mod-reject jp-mod-styled'
            }),
            Dialog.createButton({
                label: 'Submit',
                className: 'jp-Dialog-button jp-mod-accept jp-mod-styled'
            })
        ],
        hasClose: false
    });
};
