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
  ctx.filter = "contrast(1.15) brightness(1.08)";
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

/** Convert distance to confidence percentage (0.0 → 100%, 0.55 → 0%) */
export function distanceToConfidence(distance: number): number {
  return Math.max(0, Math.min(100, Math.round((1 - distance / 0.55) * 100)));
}

// ── Detection ──

const MIN_FACE_SIZE = 60;

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

export async function detectSelfie(imageDataUrl: string): Promise<SelfieResult | null> {
  await loadFaceModels();

  const img = await loadImageElement(imageDataUrl);
  const canvas = resizeImage(img, 640);

  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (detections.length !== 1) return null;

  const det = detections[0];
  if (det.detection.score < 0.75) return null;
  const box = det.detection.box;
  if (box.width < 80 || box.height < 80) return null;

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

// ── Matching ──

export interface MatchCandidate {
  photoId: string;
  distance: number;
  confidence: number;
}

/**
 * Simple single-selfie matching:
 * - For each photo, pick the lowest distance face
 * - Filter by threshold (default 0.5)
 * - Filter by min confidence (75%)
 * - Sort by distance ascending
 */
export function matchFaces(
  selfieDescriptors: Float32Array[],
  storedFaces: { photo_id: string; descriptor: number[] }[],
  threshold: number = 0.5,
  maxResults: number = 50
): MatchCandidate[] {
  if (selfieDescriptors.length === 0 || storedFaces.length === 0) return [];

  const selfieDesc = normalizeDescriptor(selfieDescriptors[0]);
  const bestPerPhoto = new Map<string, number>();

  for (const face of storedFaces) {
    const normalizedFace = normalizeDescriptor(face.descriptor);
    const distance = euclideanDistance(selfieDesc, normalizedFace);

    const current = bestPerPhoto.get(face.photo_id);
    if (current === undefined || distance < current) {
      bestPerPhoto.set(face.photo_id, distance);
    }
  }

  const candidates: MatchCandidate[] = [];

  for (const [photoId, distance] of bestPerPhoto) {
    if (distance > threshold) continue;
    const confidence = distanceToConfidence(distance);
    if (confidence < 75) continue;
    candidates.push({ photoId, distance, confidence });
  }

  candidates.sort((a, b) => a.distance - b.distance);

  // Hard negative filter
  if (candidates.length >= 2) {
    const diff = Math.abs(candidates[0].distance - candidates[1].distance);
    if (diff < 0.015 && candidates[0].distance > 0.35) {
      candidates.splice(1, 1);
    }
  }

  const limited = candidates.slice(0, maxResults);

  console.log(`Match: ${storedFaces.length} faces, ${bestPerPhoto.size} photos → ${limited.length} matches (threshold: ${threshold})`);

  return limited;
}
