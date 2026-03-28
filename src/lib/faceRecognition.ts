import * as faceapi from "face-api.js";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";

let modelsLoaded = false;
let modelsLoading = false;
let loadPromise: Promise<void> | null = null;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoading && loadPromise) return loadPromise;

  modelsLoading = true;
  loadPromise = (async () => {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    modelsLoaded = true;
    modelsLoading = false;
  })();

  return loadPromise;
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

/**
 * Load an image element from a URL (handles CORS via canvas redraw)
 */
async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Detect all faces in an image and return their 128-d descriptors.
 */
export async function detectFaces(imageUrl: string): Promise<Float32Array[]> {
  await loadFaceModels();

  const img = await loadImageElement(imageUrl);
  const detections = await faceapi
    .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map((d) => d.descriptor);
}

/**
 * Detect a single face from a selfie (data URL or file URL).
 * Returns the descriptor or null if no face found.
 */
export async function detectSelfie(imageDataUrl: string): Promise<Float32Array | null> {
  await loadFaceModels();

  const img = await loadImageElement(imageDataUrl);
  const detection = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection?.descriptor || null;
}

/**
 * Calculate Euclidean distance between two face descriptors.
 */
export function euclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Match a selfie descriptor against stored descriptors.
 * Returns photo_ids that match within the threshold.
 */
export function matchFaces(
  selfieDescriptor: Float32Array,
  storedFaces: { photo_id: string; descriptor: number[] }[],
  threshold: number = 0.55
): string[] {
  const matchedPhotoIds = new Set<string>();

  for (const face of storedFaces) {
    const distance = euclideanDistance(selfieDescriptor, face.descriptor);
    if (distance < threshold) {
      matchedPhotoIds.add(face.photo_id);
    }
  }

  return Array.from(matchedPhotoIds);
}
