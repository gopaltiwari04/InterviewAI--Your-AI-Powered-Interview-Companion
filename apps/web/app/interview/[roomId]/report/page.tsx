import { db } from "@repo/database";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// 1. Notice the type of params is now a Promise
export default async function ReportPage({ params }: { params: Promise<{ roomId: string }> }) {
  // 2. Await the params before using them!
  const { roomId } = await params;

  // 3. Fetch the generated report from your database using the awaited roomId
  const report = await db.interviewReport.findUnique({
    where: { roomId: roomId },
  });

  // If the user tries to view a report that doesn't exist yet, show a 404
  if (!report) {
    return notFound();
  }

  // 4. Render the Dashboard
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 px-8 py-6">
          <h1 className="text-3xl font-extrabold text-white">Interview Assessment Report</h1>
          <p className="text-slate-300 mt-2 text-sm">Room ID: {roomId}</p>
        </div>

        <div className="p-8">
          {/* Scores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-xl">
              <h2 className="text-sm font-bold text-indigo-600 uppercase tracking-wide">Technical Score</h2>
              <p className="text-5xl font-black text-indigo-900 mt-2">{report.techScore}<span className="text-2xl text-indigo-400">/10</span></p>
            </div>
            <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-xl">
              <h2 className="text-sm font-bold text-emerald-600 uppercase tracking-wide">Communication Score</h2>
              <p className="text-5xl font-black text-emerald-900 mt-2">{report.commScore}<span className="text-2xl text-emerald-400">/10</span></p>
            </div>
          </div>

          {/* Feedback Sections */}
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">Core Strengths</h3>
              <ul className="space-y-2">
                {report.strengths.map((strength: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <span className="text-emerald-500 mr-2">✓</span>
                    <span className="text-gray-700">{strength}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">Areas for Improvement</h3>
              <ul className="space-y-2">
                {report.weaknesses.map((weakness: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <span className="text-rose-500 mr-2">✗</span>
                    <span className="text-gray-700">{weakness}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 flex justify-center">
  <Button asChild>
    <Link href="/dashboard">
      Back to Dashboard
    </Link>
  </Button>
</div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">Detailed AI Feedback</h3>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-6 rounded-lg border border-gray-100">
                {report.aiFeedback}
              </p>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}