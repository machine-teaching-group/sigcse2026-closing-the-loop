import React from 'react';
import { Dialog, showDialog, ReactWidget } from '@jupyterlab/apputils';
class ReflectionInputWidget extends ReactWidget {
    constructor(message) {
        super();
        this._message = '';
        this._message = message;
    }
    getValue() {
        var _a, _b;
        return {
            email: (_a = this.node.querySelector('input')) === null || _a === void 0 ? void 0 : _a.value,
            reflection: (_b = this.node.querySelector('textarea')) === null || _b === void 0 ? void 0 : _b.value
        };
    }
    render() {
        return (React.createElement("div", { className: "reflection" },
            React.createElement("div", null,
                React.createElement("label", null,
                    this._message,
                    React.createElement("textarea", { name: "reflection-input", className: "reflection-input", rows: 10 }))),
            React.createElement("div", null,
                React.createElement("label", null,
                    "Your email:",
                    React.createElement("input", { type: "text", name: "email", className: "email" }))),
            React.createElement("p", { style: { fontStyle: 'italic' } }, "Please enter your email address here so that we could notify you once the feedback is ready. The instructional team will not be able to see your email when preparing their response.")));
    }
}
export const showTAReflectionDialog = (message) => {
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
