/**
 * Client for external Python face recognition API.
 * Set VITE_FACE_API_URL in .env to your deployed API URL.
 * Expected endpoints:
 *   POST /upload  - Upload event photos, detect & store face encodings
 *   POST /match   - Upload selfie, match against stored encodings
 */

const getApiUrl = (): string => {
  const url = import.meta.env.VITE_FACE_API_URL;
  if (!url) {
    throw new Error("VITE_FACE_API_URL is not configured. Set it in your .env file.");
  }
  return url.replace(/\/$/, ""); // remove trailing slash
};

export interface UploadResponse {
  success: boolean;
  faces_detected: number;
  photo_ids: string[];
  error?: string;
}

export interface MatchResult {
  photo_id: string;
  distance: number;
}

export interface MatchResponse {
  success: boolean;
  matched: MatchResult[];
  faces_detected: number;
  error?: string;
}

/**
 * Upload event photos to the Python API for face detection & encoding storage.
 * Sends images as multipart form-data.
 */
export async function uploadPhotosToApi(
  files: File[],
  photoIds: string[],
  eventId: string
): Promise<UploadResponse> {
  const url = getApiUrl();
  const formData = new FormData();
  
  files.forEach((file, i) => {
    formData.append("images", file);
  });
  
  // Send photo IDs so the backend can map encodings to database records
  photoIds.forEach((id) => {
    formData.append("photo_ids", id);
  });
  
  formData.append("event_id", eventId);

  const response = await fetch(`${url}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload API error (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Send a selfie to the Python API for face matching.
 * Returns matched photo_ids sorted by distance (best first).
 */
export async function matchSelfieViaApi(
  selfieFile: File,
  eventId: string
): Promise<MatchResponse> {
  const url = getApiUrl();
  const formData = new FormData();
  formData.append("selfie", selfieFile);
  formData.append("event_id", eventId);

  const response = await fetch(`${url}/match`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Match API error (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Check if the Face API is configured and reachable.
 */
export function isFaceApiConfigured(): boolean {
  try {
    getApiUrl();
    return true;
  } catch {
    return false;
  }
}
