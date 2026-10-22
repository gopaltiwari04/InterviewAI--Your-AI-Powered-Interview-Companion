import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { JoinInterview } from "@/components/interview/join-interview";

export const metadata: Metadata = { title: "Join interview" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/interview/join/${token}`)}`);
  return <JoinInterview token={token} />;
}
