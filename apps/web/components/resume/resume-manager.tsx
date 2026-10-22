"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { ApiError, api, errorText } from "@/lib/client/api";

export interface ResumeView {
  id: string;
  fileName: string;
  status: "PROCESSING" | "READY" | "FAILED";
  summary: string;
  skills: string[];
  projects: { name: string; description: string; technologies: string[] }[];
  experience: { role: string; organization: string; highlights: string[] }[];
  confirmed: boolean;
  notice: string | null;
  createdAt: string;
}

function ResumeEditor({ resume, onChanged }: { resume: ResumeView; onChanged: () => void }) {
  const [summary, setSummary] = useState(resume.summary);
  const [skills, setSkills] = useState(resume.skills.join(", "));
  const [projects, setProjects] = useState(resume.projects);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/resumes/${resume.id}`, {
        method: "PATCH",
        body: {
          summary,
          skills: skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40),
          projects: projects.filter((p) => p.name.trim()),
          experience: resume.experience,
          confirm: true,
        },
      });
      setMessage({ tone: "success", text: "Saved and confirmed. You can now choose this resume when setting up an interview." });
      onChanged();
    } catch (err) {
      setMessage({ tone: "danger", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this resume profile?")) return;
    await api(`/api/resumes/${resume.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{resume.fileName}</CardTitle>
          {resume.status !== "READY" ? <Badge tone="danger">{resume.status.toLowerCase()}</Badge> : resume.confirmed ? <Badge tone="success">confirmed</Badge> : <Badge tone="warning">needs review</Badge>}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {resume.notice && <Alert tone={resume.status === "FAILED" ? "danger" : "warning"}>{resume.notice}</Alert>}
        {resume.status === "READY" && (
          <>
            <div className="space-y-1">
              <Label htmlFor={`summary-${resume.id}`}>Summary</Label>
              <Textarea id={`summary-${resume.id}`} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1200} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`skills-${resume.id}`}>Skills (comma separated)</Label>
              <Input id={`skills-${resume.id}`} value={skills} onChange={(e) => setSkills(e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Projects</span>
                <Button size="xs" variant="outline" onClick={() => setProjects((p) => [...p, { name: "", description: "", technologies: [] }])} disabled={projects.length >= 10}>
                  Add project
                </Button>
              </div>
              {projects.length === 0 && <p className="text-xs text-muted-foreground">No projects were found. Add the ones you would like to discuss.</p>}
              {projects.map((p, i) => (
                <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_auto]">
                  <Input aria-label="Project name" value={p.name} maxLength={120} onChange={(e) => setProjects((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" />
                  <Input aria-label="Project description" value={p.description} maxLength={600} onChange={(e) => setProjects((list) => list.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="What it does and your role" />
                  <Button size="sm" variant="ghost" onClick={() => setProjects((list) => list.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            {message && <Alert tone={message.tone}>{message.text}</Alert>}
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : resume.confirmed ? "Save changes" : "Confirm profile"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ResumeManager({ initial }: { initial: ResumeView[] }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Resumes must be 2 MB or smaller.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resumes", { method: "POST", body: form, credentials: "same-origin" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new ApiError(res.status, "UPLOAD", data?.error?.message ?? "Upload failed.", null);
      }
      input.value = "";
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={upload} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1">
          <Label htmlFor="resume-file">Resume file</Label>
          <input id="resume-file" name="file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="block text-sm" required />
        </div>
        <Button type="submit" disabled={uploading}>
          {uploading ? "Processing…" : "Upload"}
        </Button>
        {error && <Alert tone="danger" className="w-full">{error}</Alert>}
      </form>
      {initial.length === 0 && <p className="text-sm text-muted-foreground">No resumes uploaded yet. Interviews work normally without one.</p>}
      {initial.map((r) => (
        <ResumeEditor key={`${r.id}-${r.confirmed}`} resume={r} onChanged={() => router.refresh()} />
      ))}
    </div>
  );
}
