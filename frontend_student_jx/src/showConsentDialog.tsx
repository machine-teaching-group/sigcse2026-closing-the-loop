import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';

export class HintConsentWidget extends ReactWidget {
  constructor() {
    super();
  }

  getValue(): string | undefined {
    return (
      this.node.querySelector(
        'input[name="hint-consent"]:checked'
      ) as HTMLInputElement
    )?.value;
  }

  protected render(): React.ReactElement<any> {
    return (
      <div className="hint-consent">
        <p>
          The hinting features in this notebook are a part of a research prototype with the purpose of supporting your learning. It is completely optional to use these features, press cancel if you do not wish to use this prototype.
        </p>
        <p>
          When you request a hint this prototype takes your notebook, as well as other contextual information you might provide, and uses external/third party large language model services for analysis. Hints may be incorrect, incomplete, or misleading, and you are encouraged to critically evaluate responses before modifying your program.
        </p>
        <p>
          If you have questions about the system, contact the instructional team.
        </p>
      </div>
    );
  }
}
