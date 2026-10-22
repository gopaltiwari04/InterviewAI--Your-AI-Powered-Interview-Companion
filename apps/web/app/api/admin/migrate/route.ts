import { NextResponse } from "next/server";
import { db, migrateRuntime } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await migrateRuntime(db);
    return NextResponse.json({
      status: "ok",
      message: "Runtime database schema synchronization executed successfully",
      result,
    });
  } catch (error) {
    console.error("Runtime migration API error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Migration failed",
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
