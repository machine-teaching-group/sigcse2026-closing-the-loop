import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';

export class HintTypeSelectionWidget extends ReactWidget {
  constructor() {
    super();
  }

  getValue(): string | undefined {
    return (
      this.node.querySelector(
        'input[name="hint-info"]:checked'
      ) as HTMLInputElement
    )?.value;
  }

  protected render(): React.ReactElement<any> {
    return (
      <div className="hint-info">
        You can request hints of the following types, but keep in mind you are
        limited in the number of hints you can request:
        <div>
          <label>
            <span className="hint-request-bar-right-request-button planning">
              Planning
            </span>{' '}
            A hint aimed at helping you to identify the steps needed to solve
            the question.
          </label>
        </div>
        <div>
          <label>
            <span className="hint-request-bar-right-request-button debugging">
              Debugging
            </span>{' '}
            A hint aimed at helping you identify and fix a bug in your current
            program.
          </label>
        </div>
        <div>
          <label>
            <span className="hint-request-bar-right-request-button optimizing">
              Optimizing
            </span>{' '}
            A hint aimed at helping you optimize your current program for better
            performance and readability.
          </label>
        </div>
      </div>
    );
  }
}
