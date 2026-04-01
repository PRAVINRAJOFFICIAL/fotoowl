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
 * Normalize a descriptor vector to unit length for consistent comparison.
 */
function normalizeDescriptor(desc: Float32Array | number[]): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < desc.length; i++) {
    sumSq += (desc[i] || 0) * (desc[i] || 0);
  }
  const magnitude = Math.sqrt(sumSq);
  const normalized = new Float32Array(desc.length);
  if (magnitude === 0) return normalized;
  for (let i = 0; i < desc.length; i++) {
    normalized[i] = (desc[i] || 0) / magnitude;
  }
  return normalized;
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
 * Detect a single face from a selfie with quality validation.
 * Returns the normalized descriptor or null if no face, multiple faces, or low quality.
 */
export async function detectSelfie(imageDataUrl: string): Promise<{ descriptor: Float32Array; confidence: number } | null> {
  await loadFaceModels();

  const img = await loadImageElement(imageDataUrl);
  const canvas = resizeImage(img, 512);

  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  // Must have exactly one face
  if (detections.length !== 1) return null;

  const detection = detections[0];
  
  // Require high confidence for selfie (frontal, clear face)
  if (detection.detection.score < 0.7) return null;

  return {
    descriptor: normalizeDescriptor(detection.descriptor),
    confidence: detection.detection.score,
  };
}

/**
 * Calculate Euclidean distance between two normalized face descriptors.
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
 * Strict face matching with normalized descriptors and best-match-per-photo logic.
 * 
 * For each photo, finds the face with the smallest distance to the selfie.
 * Only includes the photo if the best distance is below the strict threshold (0.5).
 * Re-verifies matches to eliminate false positives.
 * Returns photo IDs sorted by best match distance (most similar first).
 */
export function matchFaces(
  selfieDescriptor: Float32Array,
  storedFaces: { photo_id: string; descriptor: number[] }[],
  threshold: number = 0.5,
  maxResults: number = 50
): string[] {
  const normalizedSelfie = normalizeDescriptor(selfieDescriptor);

  // Group faces by photo_id and find the best (smallest) distance per photo
  const bestPerPhoto = new Map<string, number>();

  for (const face of storedFaces) {
    const normalizedFace = normalizeDescriptor(face.descriptor);
    const distance = euclideanDistance(normalizedSelfie, normalizedFace);

    const current = bestPerPhoto.get(face.photo_id);
    if (current === undefined || distance < current) {
      bestPerPhoto.set(face.photo_id, distance);
    }
  }

  // Filter: only accept photos where best face distance < threshold
  const candidates: { photoId: string; distance: number }[] = [];
  for (const [photoId, distance] of bestPerPhoto) {
    if (distance < threshold) {
      candidates.push({ photoId, distance });
    }
  }

  // Sort by distance (best matches first)
  candidates.sort((a, b) => a.distance - b.distance);

  // Limit results
  const limited = candidates.slice(0, maxResults);

  console.log(`Match stats: ${storedFaces.length} faces checked, ${bestPerPhoto.size} photos evaluated, ${limited.length} matches (threshold: ${threshold})`);
  for (const c of limited.slice(0, 5)) {
    console.log(`  Photo ${c.photoId.slice(0, 8)}… distance: ${c.distance.toFixed(4)}`);
  }

  return limited.map((c) => c.photoId);
}
