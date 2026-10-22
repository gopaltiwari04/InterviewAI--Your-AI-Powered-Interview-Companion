/**
 * Candidate dashboard analytics. Every query is filtered by the signed-in
 * user's ID; nothing here accepts a user ID from the client.
 */
import type { QuestionResult } from "@repo/core/evaluation";
import { TOPIC_LABELS, type Topic } from "@repo/core/problems";
import { TECHNICAL_TOPIC_LABELS, type TechnicalTopic } from "@repo/core/interview";
import { listProblems } from "@repo/problem-bank";
import { db } from "../infra";
import type { Actor } from "../interviews/access";

export interface HistoryRow {
  id: string;
  createdAt: string;
  mode: string;
  difficulty: string;
  status: string;
  evaluationStatus: string;
  overallScore: number | null;
  questionCount: number;
  answered: number;
  proctoringEnabled: boolean;
  elevatedSignals: number;
}

export async function interviewHistory(actor: Actor, page = 1, pageSize = 10): Promise<{ rows: HistoryRow[]; total: number; page: number; pageSize: number }> {
  const take = Math.min(Math.max(pageSize, 1), 50);
  const skip = (Math.max(page, 1) - 1) * take;
  const where = { userId: actor.userId, status: { not: "CANCELLED" as const } };
  const [total, rooms] = await Promise.all([
    db.interviewRoom.count({ where }),
    db.interviewRoom.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        createdAt: true,
        mode: true,
        difficulty: true,
        status: true,
        evaluationStatus: true,
        questionCount: true,
        proctoringEnabled: true,
        report: { select: { overallScore: true } },
        _count: { select: { questions: { where: { status: "ANSWERED" } }, proctoringEvents: { where: { severity: { in: ["MEDIUM", "HIGH"] } } } } },
      },
    }),
  ]);
  return {
    total,
    page: Math.max(page, 1),
    pageSize: take,
    rows: rooms.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      mode: r.mode,
      difficulty: r.difficulty,
      status: r.status,
      evaluationStatus: r.evaluationStatus,
      overallScore: r.report?.overallScore ?? null,
      questionCount: r.questionCount,
      answered: r._count.questions,
      proctoringEnabled: r.proctoringEnabled,
      elevatedSignals: r._count.proctoringEvents,
    })),
  };
}

export interface DashboardStats {
  totals: { interviews: number; completed: number; codingSubmissions: number; acceptedSubmissions: number; averageScore: number | null };
  trend: { date: string; overall: number | null; technical: number | null; communication: number | null }[];
  skills: { key: string; label: string; average: number; samples: number }[];
  topics: { topic: string; label: string; attempted: number; averagePassRate: number }[];
  weakTopics: string[];
  recommendations: { slug: string; title: string; difficulty: string; topics: string[]; reason: string }[];
}

const topicLabel = (t: string) => TOPIC_LABELS[t as Topic] ?? TECHNICAL_TOPIC_LABELS[t as TechnicalTopic] ?? t;

export async function dashboardStats(actor: Actor): Promise<DashboardStats> {
  const [interviews, completed, submissionAgg, reports, codingQuestions, seenSlugs] = await Promise.all([
    db.interviewRoom.count({ where: { userId: actor.userId, status: { not: "CANCELLED" } } }),
    db.interviewRoom.count({ where: { userId: actor.userId, status: "COMPLETED" } }),
    db.submission.groupBy({ by: ["verdict"], where: { userId: actor.userId, kind: "SUBMIT", status: "COMPLETED" }, _count: { _all: true } }),
    db.interviewReport.findMany({
      where: { room: { userId: actor.userId }, overallScore: { not: null } },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { overallScore: true, techScore: true, commScore: true, dimensionScores: true, room: { select: { completedAt: true, createdAt: true } } },
    }),
    db.interviewQuestion.findMany({
      where: { room: { userId: actor.userId }, kind: "CODING", status: { in: ["ANSWERED", "SKIPPED"] } },
      select: { id: true, topic: true, problemSlug: true, status: true, submissions: { where: { kind: "SUBMIT", status: "COMPLETED" }, select: { passedCount: true, totalCount: true } } },
      take: 300,
      orderBy: { askedAt: "desc" },
    }),
    db.interviewQuestion.findMany({ where: { room: { userId: actor.userId }, problemSlug: { not: null } }, select: { problemSlug: true } }),
  ]);

  const codingSubmissions = submissionAgg.reduce((n, g) => n + g._count._all, 0);
  const acceptedSubmissions = submissionAgg.find((g) => g.verdict === "ACCEPTED")?._count._all ?? 0;
  const scores = reports.map((r) => r.overallScore!).filter((s) => s !== null);

  const skillAcc = new Map<string, { label: string; total: number; n: number }>();
  for (const r of reports) {
    for (const q of (r.dimensionScores ?? []) as unknown as QuestionResult[]) {
      for (const d of q.dimensions ?? []) {
        if (d.score === null || d.score === undefined) continue;
        const acc = skillAcc.get(d.key) ?? { label: d.label, total: 0, n: 0 };
        acc.total += d.score * 10;
        acc.n++;
        skillAcc.set(d.key, acc);
      }
    }
  }

  const topicAcc = new Map<string, { attempted: number; passSum: number }>();
  for (const q of codingQuestions) {
    if (!q.topic) continue;
    const best = q.submissions.reduce((m, s) => Math.max(m, s.totalCount ? (s.passedCount ?? 0) / s.totalCount : 0), 0);
    const acc = topicAcc.get(q.topic) ?? { attempted: 0, passSum: 0 };
    acc.attempted++;
    acc.passSum += q.status === "SKIPPED" ? 0 : best;
    topicAcc.set(q.topic, acc);
  }
  const topics = [...topicAcc.entries()]
    .map(([topic, a]) => ({ topic, label: topicLabel(topic), attempted: a.attempted, averagePassRate: Math.round((a.passSum / a.attempted) * 100) }))
    .sort((a, b) => a.averagePassRate - b.averagePassRate);
  const weakTopics = topics.filter((t) => t.averagePassRate < 70).slice(0, 3).map((t) => t.topic);

  const seen = new Set(seenSlugs.map((s) => s.problemSlug!));
  const recommendations: DashboardStats["recommendations"] = [];
  for (const topic of weakTopics) {
    const candidates = listProblems({ topics: [topic as Topic] }).filter((p) => !seen.has(p.slug));
    const easiest = [...candidates].sort((a, b) => ["EASY", "MEDIUM", "HARD"].indexOf(a.difficulty) - ["EASY", "MEDIUM", "HARD"].indexOf(b.difficulty)).slice(0, 2);
    for (const p of easiest) recommendations.push({ ...p, reason: `Practise ${topicLabel(topic)}: your hidden-test pass rate there is below 70%.` });
  }
  if (recommendations.length < 3) {
    for (const p of listProblems().filter((x) => !seen.has(x.slug) && !recommendations.some((r) => r.slug === x.slug))) {
      if (recommendations.length >= 4) break;
      if (p.difficulty === (scores.length && scores[scores.length - 1]! >= 75 ? "MEDIUM" : "EASY")) {
        recommendations.push({ ...p, reason: "A problem you have not attempted yet, at a level that matches your recent results." });
      }
    }
  }

  return {
    totals: {
      interviews,
      completed,
      codingSubmissions,
      acceptedSubmissions,
      averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    },
    trend: reports.map((r) => ({
      date: (r.room.completedAt ?? r.room.createdAt).toISOString(),
      overall: r.overallScore,
      technical: r.techScore,
      communication: r.commScore,
    })),
    skills: [...skillAcc.entries()].map(([key, a]) => ({ key, label: a.label, average: Math.round(a.total / a.n), samples: a.n })).sort((a, b) => a.average - b.average),
    topics,
    weakTopics,
    recommendations: recommendations.slice(0, 4),
  };
}
