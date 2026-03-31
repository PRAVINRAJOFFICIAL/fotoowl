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
 * Resize image to max dimension for faster processing
 */
function resizeImage(img: HTMLImageElement, maxSize: number = 512): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  let { width, height } = img;
  if (width > height) {
    if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
  } else {
    if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  // Auto enhance brightness/contrast
  ctx.filter = "contrast(1.1) brightness(1.05)";
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Detect all faces in an image with confidence filtering.
 * Returns descriptors only for high-confidence detections (>0.8 score).
 */
export async function detectFaces(imageUrl: string): Promise<Float32Array[]> {
  await loadFaceModels();

  const img = await loadImageElement(imageUrl);
  const canvas = resizeImage(img, 512);

  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  // Filter low-confidence detections
  return detections
    .filter((d) => d.detection.score > 0.8)
    .map((d) => d.descriptor);
}

/**
 * Process photos in batches for scalability
 */
export async function detectFacesBatch(
  imageUrls: string[],
  batchSize: number = 3,
  onProgress?: (done: number, total: number) => void
): Promise<{ url: string; descriptors: Float32Array[] }[]> {
  const results: { url: string; descriptors: Float32Array[] }[] = [];
  
  for (let i = 0; i < imageUrls.length; i += batchSize) {
    const batch = imageUrls.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        try {
          const descriptors = await detectFaces(url);
          return { url, descriptors };
        } catch {
          return { url, descriptors: [] as Float32Array[] };
        }
      })
    );
    results.push(...batchResults);
    onProgress?.(Math.min(i + batchSize, imageUrls.length), imageUrls.length);
  }
  
  return results;
}

/**
 * Detect a single face from a selfie.
 * Returns the descriptor or null if no face or multiple faces found.
 */
export async function detectSelfie(imageDataUrl: string): Promise<Float32Array | null> {
  await loadFaceModels();

  const img = await loadImageElement(imageDataUrl);
  const canvas = resizeImage(img, 512);

  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  // Must have exactly one face
  if (detections.length !== 1) return null;

  return detections[0].descriptor;
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
 * Match a selfie descriptor against stored descriptors with fallback threshold.
 */
export function matchFaces(
  selfieDescriptor: Float32Array,
  storedFaces: { photo_id: string; descriptor: number[] }[],
  threshold: number = 0.55,
  fallbackThreshold: number = 0.6
): string[] {
  const matchedPhotoIds = new Set<string>();

  // First pass with strict threshold
  for (const face of storedFaces) {
    const distance = euclideanDistance(selfieDescriptor, face.descriptor);
    if (distance < threshold) {
      matchedPhotoIds.add(face.photo_id);
    }
  }

  // If no matches, try fallback threshold
  if (matchedPhotoIds.size === 0) {
    for (const face of storedFaces) {
      const distance = euclideanDistance(selfieDescriptor, face.descriptor);
      if (distance < fallbackThreshold) {
        matchedPhotoIds.add(face.photo_id);
      }
    }
  }

  return Array.from(matchedPhotoIds);
}
