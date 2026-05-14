/**
 * Dynamically loads and wraps Google Identity + Picker API.
 */
declare var google: any;
declare var gapi: any;

/**
 * Loads the necessary Google scripts.
 * Returns a promise that resolves when both Identity and Client/Picker are ready.
 */
export function loadGoogleScripts(clientId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let loadedCount = 0;
    const checkDone = () => {
      loadedCount++;
      if (loadedCount === 2) resolve();
    };

    // Load Identity (GIS)
    if (!document.getElementById('google-gsi')) {
      const gsiScript = document.createElement('script');
      gsiScript.id = 'google-gsi';
      gsiScript.src = 'https://accounts.google.com/gsi/client';
      gsiScript.async = true;
      gsiScript.defer = true;
      gsiScript.onload = checkDone;
      gsiScript.onerror = () => reject(new Error('Failed to load Google Identity Script'));
      document.body.appendChild(gsiScript);
    } else checkDone();

    // Load API Client
    if (!document.getElementById('google-api')) {
      const apiScript = document.createElement('script');
      apiScript.id = 'google-api';
      apiScript.src = 'https://apis.google.com/js/api.js';
      apiScript.onload = () => {
        gapi.load('client:picker', {
          callback: checkDone,
          onerror: () => reject(new Error('gapi.load:picker failed'))
        });
      };
      apiScript.onerror = () => reject(new Error('Failed to load Google Client Script'));
      document.body.appendChild(apiScript);
    } else checkDone();
  });
}

/**
 * Trigger OAuth window for Drive read-access.
 */
export function authorizeGoogleDrive(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!google?.accounts?.oauth2) {
      return reject(new Error("Google Identity library not loaded yet."));
    }

    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (tokenResponse: any) => {
        if (tokenResponse.error !== undefined) {
          console.error("GAPI Auth Error:", tokenResponse);
          reject(tokenResponse);
        } else {
          resolve(tokenResponse.access_token);
        }
      },
      error_callback: (err: any) => {
        console.error("GAPI Init Error:", err);
        reject(err);
      }
    });
    client.requestAccessToken();
  });
}

/**
 * Create a UI overlay Picker for Google Drive Folders
 */
export function createFolderPicker(accessToken: string, devKey: string): Promise<{ id: string; name: string } | null> {
  return new Promise((resolve, reject) => {
    try {
      if (!google?.picker) {
        return reject(new Error("Picker library not loaded yet."));
      }

      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .setDeveloperKey(devKey)
        // Use App ID if provided, otherwise the client ID prefix is sometimes used
        .setOAuthToken(accessToken)
        .addView(view)
        .setCallback((data: any) => {
          if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
            const doc = data[google.picker.Response.DOCUMENTS][0];
            resolve({ id: doc.id, name: doc.name });
          } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      console.error("Picker creation failed:", err);
      reject(err);
    }
  });
}

/**
 * Get all image files within a folder
 */
export async function getFilesInFolder(accessToken: string, folderId: string) {
  let files: { id: string; name: string; mimeType: string }[] = [];
  let pageToken: string | null = null;

  try {
    do {
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.append('q', `'${folderId}' in parents and (mimeType contains 'image/') and trashed = false`);
      url.searchParams.append('fields', 'nextPageToken, files(id, name, mimeType)');
      if (pageToken) url.searchParams.append('pageToken', pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(`Drive List Error: ${errData.error?.message || res.statusText}`);
      }
      
      const data = await res.json();
      if (data.files) files = files.concat(data.files);
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    console.error("getFilesInFolder failed:", err);
    throw err;
  }

  return files;
}

/**
 * Downloads a binary file from Drive.
 */
export async function downloadDriveFile(accessToken: string, fileId: string): Promise<Blob> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive Download Error: ${res.statusText}`);
  return res.blob();
}
