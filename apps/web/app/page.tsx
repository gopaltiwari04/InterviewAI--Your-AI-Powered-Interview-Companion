import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  let session = null;
  try {
    session = await auth();
  } catch (error) {
    console.error("HomePage session verification failed:", error);
  }

  if (session?.user) {
    redirect("/dashboard");
  }

  redirect("/login");
}
