import React from 'react';
import { Dialog, showDialog, ReactWidget } from '@jupyterlab/apputils';

class ReflectionInputWidget extends ReactWidget {
  private _message = '';
  constructor(message: string) {
    super();
    this._message = message;
  }
  getValue(): any {
    return {
      email: this.node.querySelector('input')?.value,
      reflection: this.node.querySelector('textarea')?.value
    };
  }
  protected render(): React.ReactElement<any> {
    return (
      <div className="reflection">
        <div>
          <label>
            {this._message}
            <textarea
              name="reflection-input"
              className="reflection-input"
              rows={10}
            />
          </label>
        </div>
        <div>
          <label>
            Your email:
            <input type="text" name="email" className="email" />
          </label>
        </div>
        <p style={{ fontStyle: 'italic' }}>
          Please enter your email address here so that we could notify you
          once the feedback is ready. The instructional team will not be able to
          see your email when preparing their response.
        </p>
      </div>
    );
  }
}

export const showTAReflectionDialog = (message: string) => {
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
