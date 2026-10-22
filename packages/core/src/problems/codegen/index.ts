import type { Language, Signature } from "../types";
import { cProgram, cStarter } from "./c";
import { cppProgram, cppStarter } from "./cpp";
import { javaProgram, javaStarter } from "./java";
import { javascriptHarness, javascriptStarter } from "./javascript";
import { pythonHarness, pythonStarter } from "./python";

export interface LanguageInfo {
  id: Language;
  label: string;
  /** Monaco editor language id. */
  monaco: string;
  /** File name shown in the editor tab. */
  fileName: string;
}

export const LANGUAGE_INFO: Record<Language, LanguageInfo> = {
  python: { id: "python", label: "Python 3", monaco: "python", fileName: "solution.py" },
  javascript: { id: "javascript", label: "JavaScript (Node.js)", monaco: "javascript", fileName: "solution.js" },
  cpp: { id: "cpp", label: "C++17", monaco: "cpp", fileName: "solution.cpp" },
  java: { id: "java", label: "Java 21", monaco: "java", fileName: "Solution.java" },
  c: { id: "c", label: "C (C11)", monaco: "c", fileName: "solution.c" },
};

export function starterCode(language: Language, sig: Signature): string {
  switch (language) {
    case "python":
      return pythonStarter(sig);
    case "javascript":
      return javascriptStarter(sig);
    case "cpp":
      return cppStarter(sig);
    case "java":
      return javaStarter(sig);
    case "c":
      return cStarter(sig);
  }
}

export function allStarterCode(sig: Signature): Record<Language, string> {
  return {
    python: pythonStarter(sig),
    javascript: javascriptStarter(sig),
    cpp: cppStarter(sig),
    java: javaStarter(sig),
    c: cStarter(sig),
  };
}

/**
 * Files written into the sandbox for one submission. The judge knows how to
 * compile and run each language; the file names here must match its config.
 */
export function assembleProgram(language: Language, sig: Signature, userCode: string): Record<string, string> {
  switch (language) {
    case "python":
      return { "solution.py": userCode, "main.py": pythonHarness(sig) };
    case "javascript":
      return { "solution.js": userCode, "main.js": javascriptHarness(sig) };
    case "cpp":
      return { "main.cpp": cppProgram(sig, userCode) };
    case "java":
      return { "Main.java": javaProgram(sig, userCode) };
    case "c":
      return { "main.c": cProgram(sig, userCode) };
  }
}
