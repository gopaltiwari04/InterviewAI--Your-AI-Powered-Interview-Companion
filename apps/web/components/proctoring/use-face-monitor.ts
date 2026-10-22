"use client";

import { PROCTORING_CONFIG } from "@repo/core/proctoring";
import { useCallback, useEffect, useRef, useState } from "react";
import { newEventId, type ProctoringQueue } from "@/lib/client/proctoring-queue";

export type CameraState = "idle" | "requesting" | "denied" | "no-device" | "unsupported" | "error" | "active" | "interrupted";
export type FaceState = "unknown" | "loading-model" | "model-unavailable" | "one" | "none" | "multiple";

const MEDIAPIPE_VERSION = "0.10.35";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

interface Detector {
  detectForVideo(video: HTMLVideoElement, timestamp: number): { detections: { categories?: { score: number }[] }[] };
  close(): void;
}

interface OpenInterval {
  id: string;
  type: "FACE_NOT_DETECTED" | "MULTIPLE_FACES_DETECTED" | "CAMERA_INTERRUPTED";
  startedAt: string;
  faceCount?: number;
}

/**
 * Camera preview and face-presence monitoring, entirely in the browser. Raw
 * frames are never uploaded or stored; only timestamped events (e.g. "no face
 * detected for 40 seconds") are recorded once `recording` is true.
 *
 * Grace periods avoid flagging blinks, glances or single missed frames, and
 * detection is a signal for review only: lighting, glasses, camera quality and
 * individual differences all affect it. No identity matching, gaze tracking
 * or emotion recognition is done.
 */
export function useFaceMonitor(queue: ProctoringQueue | null, recording: boolean) {
  const [camera, setCamera] = useState<CameraState>("idle");
  const [face, setFace] = useState<FaceState>("unknown");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const openRef = useRef<OpenInterval | null>(null);
  const sinceRef = useRef<{ kind: FaceState; since: number } | null>(null);
  const recordingRef = useRef(recording);
  const queueRef = useRef(queue);
  recordingRef.current = recording;
  queueRef.current = queue;

  const closeInterval = useCallback(() => {
    const open = openRef.current;
    openRef.current = null;
    if (!open || !recordingRef.current || !queueRef.current) return;
    queueRef.current.push({
      clientEventId: open.id,
      type: open.type,
      startedAt: open.startedAt,
      endedAt: new Date().toISOString(),
      ...(open.faceCount !== undefined ? { metadata: { faceCount: open.faceCount, detector: "mediapipe-blazeface" } } : {}),
    });
  }, []);

  const openInterval = useCallback((type: OpenInterval["type"], startedAt: number, faceCount?: number) => {
    if (openRef.current?.type === type) return;
    if (openRef.current) closeInterval();
    openRef.current = { id: newEventId(), type, startedAt: new Date(startedAt).toISOString(), faceCount };
  }, [closeInterval]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    closeInterval();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("idle");
    setFace("unknown");
  }, [closeInterval]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || video.readyState < 2) return;
    let count = 0;
    try {
      const result = detector.detectForVideo(video, performance.now());
      count = result.detections.filter((d) => (d.categories?.[0]?.score ?? 1) >= PROCTORING_CONFIG.minFaceConfidence).length;
    } catch {
      return;
    }
    const kind: FaceState = count === 0 ? "none" : count === 1 ? "one" : "multiple";
    setFace(kind);
    const now = Date.now();
    if (!sinceRef.current || sinceRef.current.kind !== kind) sinceRef.current = { kind, since: now };
    const elapsed = now - sinceRef.current.since;
    if (kind === "one") {
      if (openRef.current && openRef.current.type !== "CAMERA_INTERRUPTED") closeInterval();
    } else if (kind === "none" && elapsed >= PROCTORING_CONFIG.faceAbsenceGraceMs) {
      openInterval("FACE_NOT_DETECTED", sinceRef.current.since, 0);
    } else if (kind === "multiple" && elapsed >= PROCTORING_CONFIG.multipleFacesGraceMs) {
      openInterval("MULTIPLE_FACES_DETECTED", sinceRef.current.since, count);
    }
  }, [closeInterval, openInterval]);

  /** Only ever called from a user action (the "Set up camera" button), never automatically. */
  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unsupported");
      return;
    }
    setCamera("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
    } catch (err) {
      const name = (err as DOMException).name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCamera("denied");
        if (recordingRef.current) queueRef.current?.push({ clientEventId: newEventId(), type: "CAMERA_PERMISSION_DENIED", startedAt: new Date().toISOString() });
      } else if (name === "NotFoundError" || name === "OverconstrainedError") setCamera("no-device");
      else {
        setCamera("error");
        setError(name === "NotReadableError" ? "The camera is in use by another application." : "The camera could not be started.");
      }
      return;
    }
    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    track?.addEventListener("ended", () => {
      setCamera("interrupted");
      if (timerRef.current) clearInterval(timerRef.current);
      openInterval("CAMERA_INTERRUPTED", Date.now());
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
    if (openRef.current?.type === "CAMERA_INTERRUPTED") closeInterval();
    setCamera("active");

    if (!detectorRef.current) {
      setFace("loading-model");
      try {
        const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        detectorRef.current = (await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        })) as unknown as Detector;
      } catch {
        setFace("model-unavailable");
        return;
      }
    }
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, PROCTORING_CONFIG.detectionIntervalMs);
  }, [tick, openInterval, closeInterval]);

  // Close any open interval when recording stops (interview ended) and always release the camera on unmount.
  useEffect(() => {
    if (!recording) closeInterval();
  }, [recording, closeInterval]);
  useEffect(() => {
    const onHide = () => closeInterval();
    // Capture phase: runs before the queue's beacon so the closed interval is included in the final flush.
    window.addEventListener("pagehide", onHide, { capture: true });
    return () => {
      window.removeEventListener("pagehide", onHide, { capture: true });
      stop();
    };
  }, [stop, closeInterval]);

  /** Callback ref: re-attaches the live stream whenever a new <video> element mounts (lobby -> workspace). */
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      void el.play().catch(() => undefined);
    }
  }, []);

  return { camera, face, error, videoRef: attachVideo, start, stop };
}
