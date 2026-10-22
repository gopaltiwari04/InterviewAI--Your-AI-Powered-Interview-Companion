"use client";

import { MODE_INFO, type ClientInterview } from "@repo/core/interview";
import { PROCTORING_CONFIG } from "@repo/core/proctoring";
import { LANGUAGE_INFO } from "@repo/core/problems";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { CAMERA_MESSAGES, CameraPreview, FACE_MESSAGES } from "@/components/proctoring/camera-status";
import type { useFaceMonitor } from "@/components/proctoring/use-face-monitor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  interview: ClientInterview;
  camera: ReturnType<typeof useFaceMonitor>;
  starting: boolean;
  error: string | null;
  onStart: (proctoring: boolean) => void;
  onCancel: () => void;
}

export function Lobby({ interview, camera, starting, error, onStart, onCancel }: Props) {
  const [consent, setConsent] = useState(false);
  const cameraReady = camera.camera === "active";

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Ready when you are</h1>
        <p className="text-sm text-muted-foreground">The timer starts when you press Start. If you refresh or lose connection, your progress is kept.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{MODE_INFO[interview.mode].label} interview</CardTitle>
          <CardDescription>{MODE_INFO[interview.mode].description}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Duration</dt><dd className="font-medium">{interview.durationMinutes} min</dd></div>
            <div><dt className="text-muted-foreground">Questions</dt><dd className="font-medium">{interview.questionCount}</dd></div>
            <div><dt className="text-muted-foreground">Difficulty</dt><dd className="font-medium capitalize">{interview.difficulty.toLowerCase()}{interview.adaptive ? " · adaptive" : ""}</dd></div>
            <div><dt className="text-muted-foreground">Language</dt><dd className="font-medium">{LANGUAGE_INFO[interview.language].label}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Integrity note: switching away from this tab is recorded (with timestamps and durations) for every interview. This is shown in your report as a neutral signal; it is never treated as proof of anything.
          </p>
        </CardContent>
      </Card>

      {interview.proctoringEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-indigo-600" aria-hidden /> Camera proctoring
            </CardTitle>
            <CardDescription>You asked for a proctored interview. Please read this before turning on your camera.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>
                <strong>What is accessed:</strong> your camera only. The microphone is not used.
              </li>
              <li>
                <strong>What happens to the video:</strong> it is analysed in your browser to check whether a face is visible (about once per second). Video and images are never uploaded or recorded.
              </li>
              <li>
                <strong>What is stored:</strong> timestamped events such as &quot;no face detected for 40 seconds&quot; (only after {PROCTORING_CONFIG.faceAbsenceGraceMs / 1000} s without a face) or &quot;more than one face&quot;, plus camera interruptions.
              </li>
              <li>
                <strong>What it is not:</strong> no identity recognition, gaze tracking or emotion analysis. Detection can fail because of lighting, glasses, camera quality and individual differences, so events are signals for review, never proof of misconduct.
              </li>
              <li>You can stop the camera at any time; the interview continues unproctored.</li>
            </ul>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I understand and consent to camera-based face-presence monitoring for this interview.</span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <CameraPreview videoRef={camera.videoRef} className={cameraReady ? "" : "opacity-40"} />
              <div className="space-y-2 text-sm">
                <p role="status">{CAMERA_MESSAGES[camera.camera]}</p>
                {cameraReady && FACE_MESSAGES[camera.face] && <p role="status" className="font-medium">{FACE_MESSAGES[camera.face]}</p>}
                {camera.error && <p className="text-rose-600">{camera.error}</p>}
                {camera.camera !== "active" && camera.camera !== "requesting" && (
                  <Button variant="outline" onClick={() => void camera.start()} disabled={!consent}>
                    {camera.camera === "idle" ? "Set up camera" : "Try again"}
                  </Button>
                )}
                {cameraReady && (
                  <Button variant="ghost" size="sm" onClick={camera.stop}>
                    Turn camera off
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={starting}>
          Cancel interview
        </Button>
        <div className="flex flex-wrap gap-2">
          {interview.proctoringEnabled && (
            <Button variant="outline" onClick={() => { camera.stop(); onStart(false); }} disabled={starting}>
              Start without proctoring
            </Button>
          )}
          <Button
            onClick={() => onStart(interview.proctoringEnabled)}
            disabled={starting || (interview.proctoringEnabled && (!consent || !cameraReady))}
          >
            {starting ? "Preparing your first question…" : interview.proctoringEnabled ? "Start proctored interview" : "Start interview"}
          </Button>
        </div>
      </div>
    </main>
  );
}
