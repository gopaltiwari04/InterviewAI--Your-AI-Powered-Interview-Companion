import type { Language } from "@repo/core/problems";

export interface LanguageConfig {
  image: string;
  /** Files the judge may write into the sandbox for this language. */
  files: string[];
  /** Compile step run once per submission, or null for interpreted languages. */
  compile: string[] | null;
  run: string[];
  /** Minimum container memory: the JVM needs more headroom than native code. */
  minMemoryMb: number;
  /** Strings in stderr that indicate the program ran out of memory. */
  oomMarkers: string[];
}

const env = (name: string, fallback: string) => process.env[name] || fallback;

/**
 * Images are pinned to a major version and can be overridden per deployment.
 * For reproducible production builds pin them by digest, e.g.
 * SANDBOX_IMAGE_PYTHON=python:3.12-alpine@sha256:...
 */
export const LANGUAGES: Record<Language, LanguageConfig> = {
  python: {
    image: env("SANDBOX_IMAGE_PYTHON", "python:3.12-alpine"),
    files: ["solution.py", "main.py"],
    compile: null,
    run: ["python3", "-B", "main.py"],
    minMemoryMb: 128,
    oomMarkers: ["MemoryError"],
  },
  javascript: {
    image: env("SANDBOX_IMAGE_NODE", "node:20-alpine"),
    files: ["solution.js", "main.js"],
    compile: null,
    run: ["node", "--stack-size=7000", "--max-old-space-size=192", "main.js"],
    minMemoryMb: 256,
    oomMarkers: ["JavaScript heap out of memory"],
  },
  cpp: {
    image: env("SANDBOX_IMAGE_GCC", "gcc:16"),
    files: ["main.cpp"],
    compile: ["g++", "-std=gnu++17", "-O2", "-pipe", "-o", "main", "main.cpp"],
    run: ["./main"],
    minMemoryMb: 256,
    oomMarkers: ["std::bad_alloc"],
  },
  c: {
    image: env("SANDBOX_IMAGE_GCC", "gcc:16"),
    files: ["main.c"],
    compile: ["gcc", "-std=gnu11", "-O2", "-pipe", "-o", "main", "main.c", "-lm"],
    run: ["./main"],
    minMemoryMb: 256,
    oomMarkers: [],
  },
  java: {
    image: env("SANDBOX_IMAGE_JAVA", "eclipse-temurin:21-jdk-alpine"),
    files: ["Main.java"],
    compile: ["javac", "-J-Xmx256m", "-J-XX:+UseSerialGC", "-encoding", "UTF-8", "-d", ".", "Main.java"],
    run: ["java", "-Xss64m", "-Xmx256m", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-XX:-UsePerfData", "-Xshare:auto", "Main"],
    minMemoryMb: 512,
    oomMarkers: ["OutOfMemoryError"],
  },
};
