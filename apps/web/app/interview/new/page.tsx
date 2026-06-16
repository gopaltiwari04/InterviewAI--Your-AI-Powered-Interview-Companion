import { auth } from "@/auth";
import { db } from "@repo/database";
import { redirect } from "next/navigation";

export default async function NewInterviewPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const room = await db.interviewRoom.create({
  data: {
    status: "ACTIVE",
    userId: session.user.id,
  },
});

  await db.interviewParticipant.create({
    data: {
      roomId: room.id,
      userId: session.user.id,
    },
  });

  redirect(`/interview/${room.id}`);
}