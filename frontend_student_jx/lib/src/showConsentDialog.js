import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
export class HintConsentWidget extends ReactWidget {
    constructor() {
        super();
    }
    getValue() {
        var _a;
        return (_a = this.node.querySelector('input[name="hint-consent"]:checked')) === null || _a === void 0 ? void 0 : _a.value;
    }
    render() {
        return (React.createElement("div", { className: "hint-consent" },
            React.createElement("p", null, "The hinting features in this notebook are a part of a research prototype with the purpose of supporting your learning. It is completely optional to use these features, press cancel if you do not wish to use this prototype."),
            React.createElement("p", null, "When you request a hint this prototype takes your notebook, as well as other contextual information you might provide, and uses external/third party large language model services for analysis. Hints may be incorrect, incomplete, or misleading, and you are encouraged to critically evaluate responses before modifying your program."),
            React.createElement("p", null, "If you have questions about the system, contact the instructional team.")));
    }
}
