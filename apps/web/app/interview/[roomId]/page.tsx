import { InterviewWorkspace } from "@/components/interview/interview-workspace";

export default async function InterviewRoomPage({
  params,
}: {
  params: { roomId: string };
}) {
  const resolvedParams = await params;

  return (
    <main className="min-h-screen w-full bg-zinc-50 dark:bg-zinc-950 p-4">
      <InterviewWorkspace roomId={resolvedParams.roomId} />
    </main>
  );
}