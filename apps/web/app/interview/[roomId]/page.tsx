import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { InterviewRoom } from "@/components/interview/interview-room";
import { AppError, getInterview, listChat, listSubmissions } from "@/lib/server/engine";

export const metadata: Metadata = { title: "Interview" };
export const dynamic = "force-dynamic";

export default async function InterviewRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=/interview/${roomId}`);
  const actor = { userId: session.user.id, name: session.user.name };

  let interview;
  try {
    interview = await getInterview(roomId, actor);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
  if (interview.status === "COMPLETED") redirect(`/interview/${roomId}/report`);
  const [chat, submissions] = await Promise.all([listChat(roomId, actor), listSubmissions(roomId, actor)]);
  return <InterviewRoom initial={{ interview, chat, submissions }} />;
}
