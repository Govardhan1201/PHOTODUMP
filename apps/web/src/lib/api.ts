// Typed API client — all calls to the FastAPI backend go through here.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pm_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  skipAuth = false,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token && !skipAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail?.message || err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function register(email: string, name: string, password: string) {
  return request<{ access_token: string; user: User }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, name, password }),
  }, true);
}

export async function login(email: string, password: string) {
  return request<{ access_token: string; user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, true);
}

export async function getMe() {
  return request<User>('/api/auth/me');
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function listSessions() {
  return request<{ sessions: Session[] }>('/api/sessions/');
}

export async function deleteSession(id: string) {
  return request<{ success: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' });
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export async function uploadPhotos(
  files: File[],
  sourceType: 'LOCAL_FOLDER' | 'LOCAL_FILES',
  sessionName?: string,
) {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  form.append('source_type', sourceType);
  if (sessionName) form.append('session_name', sessionName);

  return request<UploadResponse>('/api/photos/upload', { method: 'POST', body: form });
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function getJobProgress(sessionId: string) {
  return request<SessionProgress>(`/api/jobs/${sessionId}`);
}

// ─── Photos ──────────────────────────────────────────────────────────────────

export async function listPhotos(params: PhotoFilterParams = {}) {
  const qs = new URLSearchParams();
  if (params.category)    qs.set('category', params.category);
  if (params.hasFaces !== undefined) qs.set('hasFaces', String(params.hasFaces));
  if (params.hasUser  !== undefined) qs.set('hasUser',  String(params.hasUser));
  if (params.reviewFlag !== undefined) qs.set('reviewFlag', String(params.reviewFlag));
  if (params.search)      qs.set('search', params.search);
  if (params.sessionId)   qs.set('sessionId', params.sessionId);
  qs.set('page', String(params.page ?? 1));
  qs.set('pageSize', String(params.pageSize ?? 40));

  return request<PhotosResponse>(`/api/photos/?${qs}`);
}

export async function getCategoryCounts() {
  return request<{ total: number; counts: Record<string, number> }>('/api/photos/counts');
}

export async function moveCategory(photoId: string, category: string) {
  return request<{ success: boolean; category: string }>(`/api/photos/${photoId}/category`, {
    method: 'PATCH',
    body: JSON.stringify({ category }),
  });
}

export async function toggleReviewFlag(photoId: string) {
  return request<{ success: boolean; reviewFlag: boolean }>(`/api/photos/${photoId}/flag`, {
    method: 'PATCH',
  });
}

export async function deletePhoto(photoId: string) {
  return request<{ success: boolean }>(`/api/photos/${photoId}`, { method: 'DELETE' });
}

// ─── People ──────────────────────────────────────────────────────────────────

export async function listClusters() {
  return request<{ clusters: FaceCluster[] }>('/api/people/clusters');
}

export async function getClusterPhotos(clusterId: string) {
  return request<{ clusterId: string; photos: Photo[] }>(`/api/people/clusters/${clusterId}/photos`);
}

export async function labelCluster(clusterId: string, label: string, isUser = false) {
  return request<{ success: boolean }>(`/api/people/clusters/${clusterId}/label`, {
    method: 'PATCH',
    body: JSON.stringify({ label, isUser }),
  });
}

export async function mergeClusters(sourceClusterIds: string[], targetClusterId: string) {
  return request<{ success: boolean; targetClusterId: string; photoCount: number }>(
    '/api/people/clusters/merge',
    { method: 'POST', body: JSON.stringify({ sourceClusterIds, targetClusterId }) }
  );
}

export async function uploadReferenceFaces(files: File[]) {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  return request<{ matchedPhotos: number; clusterId: string | null }>('/api/people/find-me', {
    method: 'POST', body: form,
  });
}

// ─── Drive ───────────────────────────────────────────────────────────────────

export async function getDriveAuthUrl() {
  return request<{ authUrl: string }>('/api/drive/auth-url');
}

export async function listDriveFolders() {
  return request<{ folders: DriveFolder[] }>('/api/drive/folders');
}

export async function scanDriveFolder(folderId: string, folderName: string) {
  return request<{ sessionId: string; totalFiles: number; message: string }>('/api/drive/scan', {
    method: 'POST',
    body: JSON.stringify({ folderId, folderName }),
  });
}

export async function disconnectDrive() {
  return request<{ success: boolean }>('/api/drive/disconnect', { method: 'DELETE' });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  driveConnected: boolean;
}

export interface Session {
  id: string;
  userId: string;
  sourceType: string;
  driveFolderId: string | null;
  driveFolderName: string | null;
  status: string;
  totalPhotos: number;
  processedPhotos: number;
  failedPhotos: number;
  name: string | null;
  createdAt: string;
}

export interface Photo {
  id: string;
  sessionId: string;
  userId: string;
  filename: string;
  originalName: string;
  storageUrl: string;
  thumbnailUrl: string | null;
  category: string;
  confidence: number;
  hasFaces: boolean;
  hasUser: boolean;
  faceClusterIds: string[];
  tags: string[];
  reviewFlag: boolean;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  createdAt: string;
}

export interface FaceCluster {
  id: string;
  userId: string;
  label: string | null;
  isUser: boolean;
  photoCount: number;
  coverPhotoId: string | null;
  coverPhotoUrl: string | null;
  createdAt: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
}

export interface SessionProgress {
  sessionId: string;
  status: string;
  totalPhotos: number;
  processedPhotos: number;
  failedPhotos: number;
  percent: number;
  jobs: Array<{ id: string; status: string; photoId: string | null; errorMsg: string | null }>;
}

export interface PhotoFilterParams {
  category?: string;
  hasFaces?: boolean;
  hasUser?: boolean;
  reviewFlag?: boolean;
  search?: string;
  sessionId?: string;
  page?: number;
  pageSize?: number;
}

export interface PhotosResponse {
  photos: Photo[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UploadResponse {
  sessionId: string;
  totalPhotos: number;
  invalidSkipped: number;
  message: string;
}
