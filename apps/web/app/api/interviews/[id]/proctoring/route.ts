import { route } from "@/lib/server/api";
import { getProctoringReport } from "@/lib/server/engine";

export const GET = route<{ id: string }>("proctoring.report", async ({ actor, params }) => getProctoringReport(params.id, actor));
