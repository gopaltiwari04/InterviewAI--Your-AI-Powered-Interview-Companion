"use client";

import React, { useEffect, useState } from "react";
import {
  GraduationCap,
  Code2,
  Terminal,
  Binary,
  BookOpen,
  Sparkles,
  Quote,
  CheckCircle2,
  Award,
} from "lucide-react";

/* ---------------------------------------------------------
 * Typewriter Header Component
 * --------------------------------------------------------- */
const TAGLINES = [
  "Sign in to access your dashboard and start practicing.",
  "AI-powered technical interviews with real-time feedback.",
  "Practice DSA, System Design, and Behavioral rounds.",
  "Live code evaluation, intelligent hints, and proctoring.",
  "Level up your skills and land your dream offer.",
];

export function TypewriterHeader() {
  const titleText = "Welcome to InterviewAI";
  const [displayedTitle, setDisplayedTitle] = useState("");
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [displayedTagline, setDisplayedTagline] = useState("");
  const [isDeletingTagline, setIsDeletingTagline] = useState(false);

  // Typewriter effect for the main title on mount
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      index++;
      setDisplayedTitle(titleText.slice(0, index));
      if (index >= titleText.length) {
        clearInterval(interval);
      }
    }, 65);
    return () => clearInterval(interval);
  }, []);

  // Cycling typewriter effect for rotating taglines
  useEffect(() => {
    // Wait until main title has mostly typed out before cycling taglines
    if (displayedTitle.length < 10) return;

    const currentFullTagline = TAGLINES[taglineIndex] ?? TAGLINES[0] ?? "";
    const typingSpeed = isDeletingTagline ? 25 : 45;
    const holdDuration = 3200;

    let timeout: NodeJS.Timeout;

    if (!isDeletingTagline && displayedTagline === currentFullTagline) {
      timeout = setTimeout(() => {
        setIsDeletingTagline(true);
      }, holdDuration);
    } else if (isDeletingTagline && displayedTagline === "") {
      setIsDeletingTagline(false);
      setTaglineIndex((prev) => (prev + 1) % TAGLINES.length);
    } else {
      timeout = setTimeout(() => {
        const nextLength = isDeletingTagline
          ? displayedTagline.length - 1
          : displayedTagline.length + 1;
        setDisplayedTagline(currentFullTagline.slice(0, nextLength));
      }, typingSpeed);
    }

    return () => clearTimeout(timeout);
  }, [displayedTitle, displayedTagline, isDeletingTagline, taglineIndex]);

  return (
    <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-indigo-50 border border-indigo-100/80 shadow-xs">
        <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
        <span className="text-xs font-medium text-indigo-900 tracking-wide">
          Next-Gen Interview Preparation
        </span>
      </div>

      <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl min-h-[44px] flex items-center justify-center">
        <span>{displayedTitle}</span>
        <span className="inline-block w-0.5 h-7 ml-1 bg-indigo-600 animate-[pulse_0.9s_ease-in-out_infinite] align-middle" />
      </h2>

      <p className="mt-2.5 text-center text-sm text-slate-600 min-h-[24px] flex items-center justify-center transition-all">
        <span className="font-mono text-xs sm:text-sm text-slate-700 font-medium">
          {displayedTagline || " "}
        </span>
        <span className="inline-block w-1.5 h-3.5 ml-1 bg-slate-400 animate-ping opacity-75" />
      </p>
    </div>
  );
}

/* ---------------------------------------------------------
 * Motivational Quotes Component (Bottom)
 * --------------------------------------------------------- */
const MOTIVATIONAL_QUOTES = [
  {
    quote: "First, solve the problem. Then, write the code.",
    author: "John Johnson",
    role: "Computer Scientist",
  },
  {
    quote: "Talk is cheap. Show me the code.",
    author: "Linus Torvalds",
    role: "Creator of Linux & Git",
  },
  {
    quote: "Simplicity is prerequisite for reliability.",
    author: "Edsger W. Dijkstra",
    role: "Turing Award Laureate",
  },
  {
    quote: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.",
    author: "Martin Fowler",
    role: "Software Architect & Author",
  },
  {
    quote: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
    role: "Author & Philosopher",
  },
  {
    quote: "It's not that I'm so smart, it's just that I stay with problems longer.",
    author: "Albert Einstein",
    role: "Theoretical Physicist",
  },
  {
    quote: "The only way to learn a new programming language is by writing programs in it.",
    author: "Dennis Ritchie",
    role: "Creator of C & Unix",
  },
  {
    quote: "Optimism is an occupational hazard of programming: feedback is the treatment.",
    author: "Kent Beck",
    role: "Pioneer of Extreme Programming",
  },
];

export function MotivationalQuotes() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length);
        setIsFading(false);
      }, 400);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const current = MOTIVATIONAL_QUOTES[currentIndex] ?? MOTIVATIONAL_QUOTES[0]!;

  return (
    <div className="relative z-10 mt-8 mx-auto w-full max-w-xl px-4 sm:px-6">
      <div className="relative group rounded-2xl border border-indigo-100/80 bg-white/70 backdrop-blur-md p-4 shadow-sm hover:shadow-md transition-all duration-300">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5 rounded-lg bg-indigo-50 p-2 text-indigo-600">
            <Quote className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-xs sm:text-sm italic text-slate-700 leading-relaxed transition-opacity duration-300 ${
                isFading ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
              }`}
            >
              &ldquo;{current.quote}&rdquo;
            </p>
            <div
              className={`mt-1.5 flex items-center gap-2 text-xs text-slate-500 transition-opacity duration-300 ${
                isFading ? "opacity-0" : "opacity-100"
              }`}
            >
              <span className="font-semibold text-indigo-600">
                — {current.author}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-[11px] text-slate-400">{current.role}</span>
            </div>
          </div>
        </div>

        {/* Progress indicator dots */}
        <div className="mt-3 flex justify-center items-center gap-1.5">
          {MOTIVATIONAL_QUOTES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                setIsFading(true);
                setTimeout(() => {
                  setCurrentIndex(idx);
                  setIsFading(false);
                }, 200);
              }}
              aria-label={`Jump to quote ${idx + 1}`}
              className={`h-1 rounded-full transition-all duration-300 ${
                idx === currentIndex
                  ? "w-5 bg-indigo-600"
                  : "w-1.5 bg-slate-200 hover:bg-slate-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
 * Academic & Code Illustrations in Background
 * --------------------------------------------------------- */
export function AcademicCodeBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* 1. Academic Graduation & Excellence Badge (Top Left) */}
      <div className="login-float-subtle-1 absolute top-[11%] left-[3%] hidden xl:block w-64 rounded-xl border border-indigo-100/80 bg-white/65 p-3.5 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-indigo-600/10 p-2 text-indigo-600">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-800">
              Academic & Tech Track
            </div>
            <div className="text-[11px] text-slate-500">
              CS & Engineering Interview Ready
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[11px] border-t border-slate-100 pt-2 font-mono text-slate-600">
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="w-3 h-3" /> Accredited
          </span>
          <span className="text-slate-400">FAANG & Top Labs</span>
        </div>
      </div>

      {/* 2. Floating Code Editor / IDE Snippet Window (Top Right) */}
      <div className="login-float-subtle-2 absolute top-[10%] right-[3%] hidden lg:block w-72 rounded-xl border border-slate-200/80 bg-slate-900/90 p-3 shadow-xl backdrop-blur-md text-white font-mono text-[11px]">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            <span className="ml-2 text-[10px] text-slate-400 flex items-center gap-1">
              <Code2 className="w-3 h-3 text-indigo-400" /> solution.py
            </span>
          </div>
          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
            PASS
          </span>
        </div>
        <div className="space-y-1 text-slate-300 leading-tight">
          <div>
            <span className="text-purple-400">def</span>{" "}
            <span className="text-blue-400">maxSubArray</span>(nums:{" "}
            <span className="text-teal-400">List</span>[int]):
          </div>
          <div className="pl-3 text-slate-400">
            cur = ans = nums[0]
          </div>
          <div className="pl-3">
            <span className="text-purple-400">for</span> x{" "}
            <span className="text-purple-400">in</span> nums[1:]:
          </div>
          <div className="pl-6 text-slate-300">
            cur = max(x, cur + x)
          </div>
          <div className="pl-6 text-slate-300">
            ans = max(ans, cur)
          </div>
          <div className="pl-3">
            <span className="text-purple-400">return</span> ans
          </div>
        </div>
      </div>

      {/* 3. Algorithmic Binary Tree / Data Structures Card (Mid Left) */}
      <div className="login-float-subtle-3 absolute top-[48%] left-[2%] hidden xl:block w-60 rounded-xl border border-purple-100/90 bg-white/70 p-3 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2 mb-2">
          <Binary className="w-4 h-4 text-purple-600" />
          <span className="text-xs font-semibold text-slate-800">
            Data Structures & Trees
          </span>
        </div>
        {/* Stylized SVG Tree */}
        <svg
          className="w-full h-16 text-indigo-500/80"
          viewBox="0 0 200 65"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Branch lines */}
          <line x1="100" y1="16" x2="60" y2="44" stroke="#c7d2fe" strokeWidth="2" strokeDasharray="3 3" />
          <line x1="100" y1="16" x2="140" y2="44" stroke="#c7d2fe" strokeWidth="2" strokeDasharray="3 3" />
          <line x1="60" y1="44" x2="35" y2="60" stroke="#e0e7ff" strokeWidth="1.5" />
          <line x1="60" y1="44" x2="85" y2="60" stroke="#e0e7ff" strokeWidth="1.5" />
          <line x1="140" y1="44" x2="120" y2="60" stroke="#e0e7ff" strokeWidth="1.5" />
          <line x1="140" y1="44" x2="165" y2="60" stroke="#e0e7ff" strokeWidth="1.5" />

          {/* Root node */}
          <circle cx="100" cy="14" r="9" className="fill-indigo-600 shadow" />
          <text x="100" y="17" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">
            R
          </text>

          {/* Left child */}
          <circle cx="60" cy="44" r="8" className="fill-purple-500" />
          <text x="60" y="47" textAnchor="middle" fill="white" fontSize="8">
            L
          </text>

          {/* Right child */}
          <circle cx="140" cy="44" r="8" className="fill-teal-500" />
          <text x="140" y="47" textAnchor="middle" fill="white" fontSize="8">
            R
          </text>

          {/* Leaves */}
          <circle cx="35" cy="60" r="4" fill="#818cf8" />
          <circle cx="85" cy="60" r="4" fill="#a78bfa" />
          <circle cx="120" cy="60" r="4" fill="#2dd4bf" />
          <circle cx="165" cy="60" r="4" fill="#38bdf8" />
        </svg>
        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-1 pt-1 border-t border-purple-50">
          <span>O(log N) Lookup</span>
          <span className="text-purple-600 font-bold">Balanced BST</span>
        </div>
      </div>

      {/* 4. Terminal / Proctoring AI Badge (Mid-Right) */}
      <div className="login-float-subtle-1 absolute top-[50%] right-[2%] hidden xl:block w-64 rounded-xl border border-slate-200/70 bg-white/70 p-3 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-semibold text-slate-800">
            Realtime Code Runner
          </span>
          <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-100 text-emerald-800">
            Live Sandbox
          </span>
        </div>
        <div className="rounded-lg bg-slate-900 p-2 font-mono text-[10px] text-slate-300 space-y-1">
          <div className="text-emerald-400">
            $ interviewai exec --proctored
          </div>
          <div className="text-slate-400">
            [Proctor] Gaze & tab: NORMAL
          </div>
          <div className="text-cyan-300">
            [AI] 45/45 tests passed (12ms)
          </div>
        </div>
      </div>

      {/* 5. Academic Degree & AI Assessment Badge (Bottom Left) */}
      <div className="login-float-subtle-2 absolute bottom-[6%] left-[4%] hidden lg:block rounded-xl border border-blue-100/90 bg-white/75 p-3 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-800">
              Curated Curriculum
            </div>
            <div className="text-[10px] text-slate-500">
              Algorithms • System Design • Concurrency
            </div>
          </div>
        </div>
      </div>

      {/* 6. Performance Score Badge (Bottom Right) */}
      <div className="login-float-subtle-3 absolute bottom-[6%] right-[4%] hidden lg:block rounded-xl border border-indigo-100/90 bg-white/75 p-3 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-800">
              AI Evaluation Report
            </div>
            <div className="text-[10px] text-slate-500">
              Personalized Strengths & Improvement Plan
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
