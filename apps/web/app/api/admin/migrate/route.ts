import { NextResponse } from "next/server";
import { dashboardStats, db, interviewHistory, migrateRuntime } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await migrateRuntime(db);

    let verification: { success: boolean; error?: string; stack?: string } = { success: true };
    try {
      const dummyActor = { userId: "00000000-0000-0000-0000-000000000000", name: "System Check" };
      await Promise.all([
        dashboardStats(dummyActor),
        interviewHistory(dummyActor, 1, 10),
      ]);
    } catch (testErr) {
      verification = {
        success: false,
        error: testErr instanceof Error ? testErr.message : String(testErr),
        stack: testErr instanceof Error ? testErr.stack : undefined,
      };
    }

    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        _count: { select: { rooms: true } },
      },
    });

    const envDiag = {
      hasGeminiKey: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      aiProvider: process.env.AI_PROVIDER ?? "default (gemini)",
      hasRedis: !!process.env.REDIS_URL,
    };

    return NextResponse.json({
      status: verification.success ? "ok" : "warning",
      message: "Runtime database schema synchronization executed successfully",
      verification,
      envDiag,
      users,
      result,
    });
  } catch (error) {
    console.error("Runtime migration API error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Migration failed",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
