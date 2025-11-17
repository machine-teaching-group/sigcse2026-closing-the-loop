import { URLExt } from '@jupyterlab/coreutils';

import { ServerConnection } from '@jupyterlab/services';

/**
 * Call the API extension
 *
 * @param endPoint API REST end point for the extension
 * @param init Initial values for the request
 * @returns The response body interpreted as JSON
 */
export async function requestAPI<T>(
  endPoint = '',
  init: RequestInit = {}
): Promise<T> {
  // Make request to Jupyter API
  const settings = ServerConnection.makeSettings();
  // Support query strings in endPoint without encoding '?'
  let path = endPoint;
  let query = '';
  const qIndex = endPoint.indexOf('?');
  if (qIndex >= 0) {
    path = endPoint.substring(0, qIndex);
    query = endPoint.substring(qIndex); // includes leading '?'
  }
  const basePath = URLExt.join(
    settings.baseUrl,
    'hintbot',
    path
  );
  const requestUrl = `${basePath}${query}`;

  let response: Response;
  try {
    response = await ServerConnection.makeRequest(requestUrl, init, settings);
  } catch (error) {
    throw new ServerConnection.NetworkError(error as any);
  }

  let data: any = await response.text();

  if (data.length > 0) {
    try {
      data = JSON.parse(data);
    } catch (error) {
      console.log('Not a JSON response body.', response);
    }
  }

  if (!response.ok) {
    // If the Jupyter server returns 404 for our hintbot endpoints it usually
    // means the server extension (the Python package that registers `/hintbot`)
    // is not installed or not enabled in the running Jupyter Server. Provide
    // a clearer error to help debugging in fresh installs from PyPI.
    if (response.status === 404) {
      const help = `HintBot server extension not found at ${requestUrl}. ` +
        `Ensure the Python package is installed in the environment where you run Jupyter Server and that the server extension is enabled (e.g. run: \n` +
        `  jupyter server extension enable --sys-prefix hintbot \n` +
        `then restart Jupyter Server).`;
      console.error(help, response);
      throw new Error(help);
    }
    throw new ServerConnection.ResponseError(response, data.message || data);
  }

  return data;
}
