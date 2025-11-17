import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
export class HintTypeSelectionWidget extends ReactWidget {
    constructor() {
        super();
    }
    getValue() {
        var _a;
        return (_a = this.node.querySelector('input[name="hint-info"]:checked')) === null || _a === void 0 ? void 0 : _a.value;
    }
    render() {
        return (React.createElement("div", { className: "hint-info" },
            "You can request hints of the following types, but keep in mind you are limited in the number of hints you can request:",
            React.createElement("div", null,
                React.createElement("label", null,
                    React.createElement("span", { className: "hint-request-bar-right-request-button planning" }, "Planning"),
                    ' ',
                    "A hint aimed at helping you to identify the steps needed to solve the question.")),
            React.createElement("div", null,
                React.createElement("label", null,
                    React.createElement("span", { className: "hint-request-bar-right-request-button debugging" }, "Debugging"),
                    ' ',
                    "A hint aimed at helping you identify and fix a bug in your current program.")),
            React.createElement("div", null,
                React.createElement("label", null,
                    React.createElement("span", { className: "hint-request-bar-right-request-button optimizing" }, "Optimizing"),
                    ' ',
                    "A hint aimed at helping you optimize your current program for better performance and readability."))));
    }
}
