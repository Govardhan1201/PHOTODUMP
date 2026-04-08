/**
 * Dynamically loads and wraps Google Identity + Picker API.
 */
export function loadGoogleScripts(clientId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let loadedCount = 0;

    const checkDone = () => {
      loadedCount++;
      if (loadedCount === 2) resolve();
    };

    // Load Identity
    if (!document.getElementById('google-gsi')) {
      const gsiScript = document.createElement('script');
      gsiScript.id = 'google-gsi';
      gsiScript.src = 'https://accounts.google.com/gsi/client';
      gsiScript.onload = checkDone;
      gsiScript.onerror = () => reject('Failed to load Google Identity Script');
      document.body.appendChild(gsiScript);
    } else checkDone();

    // Load Client (API)
    if (!document.getElementById('google-api')) {
      const apiScript = document.createElement('script');
      apiScript.id = 'google-api';
      apiScript.src = 'https://apis.google.com/js/api.js';
      apiScript.onload = () => {
        // @ts-ignore
        gapi.load('client:picker', checkDone);
      };
      apiScript.onerror = () => reject('Failed to load Google Client Script');
      document.body.appendChild(apiScript);
    } else checkDone();
  });
}

/**
 * Trigger OAuth window strictly for Google Drive read-access.
 */
export function authorizeGoogleDrive(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      // We only request readonly so users trust the app
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (tokenResponse: any) => {
        if (tokenResponse.error !== undefined) {
          reject(tokenResponse);
        }
        resolve(tokenResponse.access_token);
      },
    });
    client.requestAccessToken();
  });
}

/**
 * Create a UI overlay Picker for Google Drive Folders
 */
export function createFolderPicker(accessToken: string, devKey: string): Promise<{ id: string; name: string } | null> {
  return new Promise((resolve) => {
    // @ts-ignore
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setMimeTypes('application/vnd.google-apps.folder');

    // @ts-ignore
    const picker = new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED) // actually disable multiselect
      .setDeveloperKey(devKey)
      .setAppId(devKey)
      .setOAuthToken(accessToken)
      .addView(view)
      .setCallback((data: any) => {
        // @ts-ignore
        if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
          // @ts-ignore
          const doc = data[google.picker.Response.DOCUMENTS][0];
          resolve({ id: doc.id, name: doc.name });
        // @ts-ignore
        } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}

/**
 * Get all files within a folder, with pagination support
 */
export async function getFilesInFolder(accessToken: string, folderId: string) {
  let files: { id: string; name: string; mimeType: string }[] = [];
  let pageToken = null;

  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.append('q', `'${folderId}' in parents and (mimeType contains 'image/') and trashed = false`);
    url.searchParams.append('fields', 'nextPageToken, files(id, name, mimeType)');
    if (pageToken) url.searchParams.append('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!res.ok) throw new Error('Failed to fetch Drive folder');
    
    const data = await res.json();
    if (data.files) files = files.concat(data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

/**
 * Downloads a single file from Google Drive into a JS Blob.
 * Done sequentially to preserve mobile RAM!
 */
export async function downloadDriveFile(accessToken: string, fileId: string): Promise<Blob> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to download file');
  return res.blob();
}
