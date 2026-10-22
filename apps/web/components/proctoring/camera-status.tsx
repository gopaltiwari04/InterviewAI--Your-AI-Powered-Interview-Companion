"use client";

import { Camera, CameraOff, Users, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CameraState, FaceState } from "./use-face-monitor";

export const CAMERA_MESSAGES: Record<CameraState, string> = {
  idle: "Camera is off.",
  requesting: "Waiting for camera permission…",
  denied: "Camera permission was denied. You can allow it in your browser's site settings, or continue without proctoring.",
  "no-device": "No camera was found on this device.",
  unsupported: "This browser does not support camera access (it requires HTTPS).",
  error: "The camera could not be started.",
  active: "Camera is on. Video stays in your browser and is never uploaded.",
  interrupted: "The camera stopped (it may have been unplugged or used by another app).",
};

export const FACE_MESSAGES: Record<FaceState, string> = {
  unknown: "",
  "loading-model": "Loading face detection…",
  "model-unavailable": "Face detection could not be loaded; the camera preview still works.",
  one: "Face detected.",
  none: "No face detected. Make sure your face is visible and well lit.",
  multiple: "More than one face detected.",
};

export function CameraPreview({ videoRef, className }: { videoRef: (el: HTMLVideoElement | null) => void; className?: string }) {
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      aria-label="Your camera preview"
      className={cn("aspect-video w-full rounded-lg bg-zinc-900 object-cover [transform:scaleX(-1)]", className)}
    />
  );
}

/** Small, unobtrusive status shown in the interview header. */
export function CameraStatusBadge({ camera, face }: { camera: CameraState; face: FaceState }) {
  const ok = camera === "active" && (face === "one" || face === "loading-model" || face === "unknown");
  const Icon = camera !== "active" ? CameraOff : face === "multiple" ? Users : face === "none" ? UserX : Camera;
  const text = camera !== "active" ? CAMERA_MESSAGES[camera] : FACE_MESSAGES[face] || CAMERA_MESSAGES.active;
  return (
    <span
      role="status"
      title={text}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
        ok ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">{camera === "active" ? (face === "one" ? "Camera on" : face === "none" ? "No face" : face === "multiple" ? "Multiple faces" : "Camera on") : "Camera off"}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
