import React from 'react';
import { Dialog, showDialog, ReactWidget } from '@jupyterlab/apputils';

class ReflectionInputWidget extends ReactWidget {
  private _message = '';
  constructor(message: string) {
    super();
    this._message = message;
  }
  getValue(): string | undefined {
    return this.node.querySelector('textarea')?.value;
  }
  protected render(): React.ReactElement<any> {
    return (
      <div className="reflection">
        <p>{this._message}</p>
        <textarea
          name="reflection-input"
          className="reflection-input"
          rows={10}
        />
        <p style={{ fontStyle: 'italic' }}>
          Text entered here will be passed to the external language model
          service to improve hint relevance.
        </p>
      </div>
    );
  }
}

export const showReflectionDialog = (message: string) => {
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
