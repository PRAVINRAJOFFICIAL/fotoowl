import * as faceapi from "face-api.js";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";

let modelsLoaded = false;
let modelsLoading = false;
let loadPromise: Promise<void> | null = null;

/**
 * Load SsdMobilenetv1 + landmarks + recognition for maximum accuracy.
 */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoading && loadPromise) return loadPromise;

  modelsLoading = true;
  loadPromise = (async () => {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    modelsLoading = false;
  })();

  return loadPromise;
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

// ── Image preprocessing ──

function resizeImage(img: HTMLImageElement, maxSize: number = 640): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  let { width, height } = img;
  const scale = Math.min(maxSize / Math.max(width, height), 1);
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "contrast(1.12) brightness(1.06)";
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

// ── Descriptor math ──

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

export function euclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/** Average multiple descriptors for more stable representation */
export function averageDescriptors(descriptors: Float32Array[]): Float32Array {
  if (descriptors.length === 0) return new Float32Array(128);
  if (descriptors.length === 1) return descriptors[0];
  const avg = new Float32Array(128);
  for (const d of descriptors) {
    for (let i = 0; i < 128; i++) avg[i] += d[i];
  }
  for (let i = 0; i < 128; i++) avg[i] /= descriptors.length;
  return normalizeDescriptor(avg);
}

/** Convert distance to confidence percentage (0.0 → 100%, 0.6 → 0%) */
export function distanceToConfidence(distance: number): number {
  return Math.max(0, Math.min(100, Math.round((1 - distance / 0.6) * 100)));
}

// ── Detection ──

const MIN_FACE_SIZE = 50; // px — ignore tiny faces

/**
 * Detect all faces in an image using SsdMobilenetv1 (high accuracy).
 * Filters by confidence (>0.7) and minimum face size.
 */
export async function detectFaces(imageUrl: string): Promise<Float32Array[]> {
  await loadFaceModels();

  const img = await loadImageElement(imageUrl);
  const canvas = resizeImage(img, 640);

  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections
    .filter((d) => {
      const box = d.detection.box;
      return d.detection.score > 0.7 && box.width >= MIN_FACE_SIZE && box.height >= MIN_FACE_SIZE;
    })
    .map((d) => normalizeDescriptor(d.descriptor));
}

/**
 * Process photos in batches.
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

// ── Selfie detection ──

export interface SelfieResult {
  descriptor: Float32Array;
  confidence: number;
}

/**
 * Detect a single face from a selfie with strict quality validation.
 * Returns null if no face, multiple faces, low confidence, or too small.
 */
export async function detectSelfie(imageDataUrl: string): Promise<SelfieResult | null> {
  await loadFaceModels();

  const img = await loadImageElement(imageDataUrl);
  const canvas = resizeImage(img, 640);

  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  // Must have exactly one face
  if (detections.length !== 1) return null;

  const det = detections[0];

  // Require high confidence and minimum face size
  if (det.detection.score < 0.75) return null;
  const box = det.detection.box;
  if (box.width < 80 || box.height < 80) return null;

  // Check face is reasonably centered (within middle 80% of image)
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (cx < canvas.width * 0.1 || cx > canvas.width * 0.9 ||
      cy < canvas.height * 0.1 || cy > canvas.height * 0.9) {
    return null;
  }

  return {
    descriptor: normalizeDescriptor(det.descriptor),
    confidence: det.detection.score,
  };
}

/**
 * Detect selfie from multiple captures, average descriptors for stability.
 * Returns null if any capture fails validation.
 */
export async function detectMultiSelfie(imageDataUrls: string[]): Promise<{
  averaged: Float32Array;
  individual: SelfieResult[];
} | null> {
  const results: SelfieResult[] = [];

  for (const url of imageDataUrls) {
    const result = await detectSelfie(url);
    if (!result) return null; // all must succeed
    results.push(result);
  }

  if (results.length === 0) return null;

  const averaged = averageDescriptors(results.map(r => r.descriptor));
  return { averaged, individual: results };
}

// ── Matching ──

export interface MatchCandidate {
  photoId: string;
  distance: number;
  confidence: number;
}

/**
 * Strict face matching with:
 * - Normalized descriptors
 * - Best-match-per-photo
 * - Hard negative filter (reject ambiguous top matches)
 * - Confidence threshold (>75%)
 * - Double validation with multiple selfie descriptors
 */
export function matchFaces(
  selfieDescriptors: Float32Array[], // multiple selfie descriptors for double validation
  storedFaces: { photo_id: string; descriptor: number[] }[],
  threshold: number = 0.48,
  maxResults: number = 50
): MatchCandidate[] {
  if (selfieDescriptors.length === 0 || storedFaces.length === 0) return [];

  // For each selfie descriptor, compute best distance per photo
  const allPhotoScores: Map<string, number[]>[] = [];

  for (const selfieDesc of selfieDescriptors) {
    const normalized = normalizeDescriptor(selfieDesc);
    const bestPerPhoto = new Map<string, number>();

    for (const face of storedFaces) {
      const normalizedFace = normalizeDescriptor(face.descriptor);
      const distance = euclideanDistance(normalized, normalizedFace);

      const current = bestPerPhoto.get(face.photo_id);
      if (current === undefined || distance < current) {
        bestPerPhoto.set(face.photo_id, distance);
      }
    }

    // Collect scores per photo across all selfie descriptors
    const scoresMap = new Map<string, number[]>();
    for (const [photoId, dist] of bestPerPhoto) {
      scoresMap.set(photoId, [dist]);
    }
    allPhotoScores.push(scoresMap);
  }

  // Merge: for each photo, require ALL selfie descriptors to match (double validation)
  const mergedScores = new Map<string, number[]>();
  const allPhotoIds = new Set<string>();
  for (const scores of allPhotoScores) {
    for (const id of scores.keys()) allPhotoIds.add(id);
  }

  for (const photoId of allPhotoIds) {
    const distances: number[] = [];
    let allMatch = true;
    for (const scores of allPhotoScores) {
      const dists = scores.get(photoId);
      if (!dists || dists[0] === undefined) {
        allMatch = false;
        break;
      }
      distances.push(dists[0]);
    }
    // Double validation: ALL selfie descriptors must match this photo
    if (allMatch && distances.every(d => d < threshold + 0.04)) {
      mergedScores.set(photoId, distances);
    }
  }

  // Build candidates using average distance across selfie descriptors
  const candidates: MatchCandidate[] = [];
  for (const [photoId, distances] of mergedScores) {
    const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    if (avgDist < threshold) {
      const confidence = distanceToConfidence(avgDist);
      if (confidence >= 75) { // Only show high confidence matches
        candidates.push({ photoId, distance: avgDist, confidence });
      }
    }
  }

  // Sort by distance (best first)
  candidates.sort((a, b) => a.distance - b.distance);

  // Hard negative filter: if top 2 are from different people and very close, reject both
  if (candidates.length >= 2) {
    const diff = Math.abs(candidates[0].distance - candidates[1].distance);
    if (diff < 0.02 && candidates[0].distance > 0.35) {
      // Ambiguous — both are weak matches close together, remove the worse one
      console.warn(`Hard negative filter: top 2 matches too close (diff=${diff.toFixed(4)}), removing weaker match`);
      candidates.splice(1, 1);
    }
  }

  const limited = candidates.slice(0, maxResults);

  console.log(`Match stats: ${storedFaces.length} faces, ${allPhotoIds.size} photos, ${limited.length} matches (threshold: ${threshold})`);
  for (const c of limited.slice(0, 5)) {
    console.log(`  Photo ${c.photoId.slice(0, 8)}… dist: ${c.distance.toFixed(4)} conf: ${c.confidence}%`);
  }

  return limited;
}
