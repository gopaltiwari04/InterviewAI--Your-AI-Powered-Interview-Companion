import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const execAsync = promisify(exec);

// --- Configuration ---
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_NAME = "code-execution-queue";
const EXECUTION_TIMEOUT_MS = 5000; // 5 seconds max execution time

// Redis clients: One for BullMQ, one for publishing results back to the WS server
const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: redisUrl.port ? Number(redisUrl.port) : 6379,
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db: redisUrl.pathname && redisUrl.pathname !== "/" ? Number(redisUrl.pathname.slice(1)) : undefined,
  maxRetriesPerRequest: null,
};
const pubClient = new Redis(REDIS_URL);

// --- Supported Languages Map ---
// Maps a language string to its Docker image, file extension, and run command
const LANGUAGE_CONFIG: Record<string, { image: string; ext: string; command: string }> = {
  javascript: {
    image: "node:20-alpine",
    ext: "js",
    command: "node main.js",
  },

  python: {
    image: "python:3.10-alpine",
    ext: "py",
    command: "python main.py",
  },

  cpp: {
  image: "gcc:latest",
  ext: "cpp",
  command: 'sh -c "g++ main.cpp -o main && ./main"',
},

  c: {
  image: "gcc:latest",
  ext: "c",
  command: 'sh -c "gcc main.c -o main && ./main"',
},

  java: {
  image: "eclipse-temurin:17",
  ext: "java",
  command: 'sh -c "javac main.java && java main"',
},
};

interface ExecutionPayload {
  roomId: string;
  userId: string;
  language: string;
  code: string;
}

interface ExecutionResult {
  roomId: string;
  userId: string;
  status: "success" | "error" | "timeout" | "unsupported_language";
  output: string;
  executionTimeMs: number;
}

// --- Security & Execution Logic ---
async function executeCode(payload: ExecutionPayload): Promise<ExecutionResult> {
  const { language, code, roomId, userId } = payload;
  const startTime = Date.now();

  if (!LANGUAGE_CONFIG[language]) {
    return { roomId, userId, status: "unsupported_language", output: "Language not supported.", executionTimeMs: 0 };
  }

  const config = LANGUAGE_CONFIG[language];
  const executionId = crypto.randomUUID();
  // Using the host OS temp directory
  const tempDir = path.join(process.cwd(), "tmp", executionId); 
  const filePath = path.join(tempDir, `main.${config.ext}`);

  try {
    // 1. Create a temporary directory and write the user's code to it
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(filePath, code);

    // 2. Construct the Secure Docker Command
    // - --rm: Automatically remove container when done
    // - --network none: NO internet access (prevents SSRF/crypto mining)
    // - --memory 256m: Strict RAM limit
    // - --cpus 0.5: Strict CPU limit
    // - -v: Mount only the specific temp directory as read-only (ro) if possible, but we need execution context so standard mount is fine
    const dockerCmd = `docker run --rm --network none --memory 256m --cpus 0.5 -v ${tempDir}:/usr/src/app -w /usr/src/app ${config.image} ${config.command}`;

    // 3. Execute with a strict timeout
    const { stdout, stderr } = await execAsync(dockerCmd, { timeout: EXECUTION_TIMEOUT_MS });

    return {
      roomId,
      userId,
      status: "success",
      output: stdout || stderr,
      executionTimeMs: Date.now() - startTime,
    };

  } catch (error: any) {
  console.error("========== EXECUTION ERROR ==========");
  console.error(error);
  console.error("STDERR:", error.stderr);
  console.error("MESSAGE:", error.message);
  console.error("====================================");

  const isTimeout = error.killed && error.signal === 'SIGTERM';

  return {
    roomId,
    userId,
    status: isTimeout ? "timeout" : "error",
    output: isTimeout
      ? `Execution timed out after ${EXECUTION_TIMEOUT_MS}ms.`
      : error.stderr || error.message,
    executionTimeMs: Date.now() - startTime,
  };
} finally {
    // 4. Always clean up the temporary files to prevent disk exhaustion
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`Failed to clean up temp dir ${tempDir}:`, cleanupError);
    }
  }
}

// --- The Queue Worker ---
console.log(`[Executor] Starting worker. Listening to queue: ${QUEUE_NAME}...`);

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job<ExecutionPayload>) => {
    console.log(`[Executor] Processing job ${job.id} for room ${job.data.roomId}`);
    
    // Execute the code safely inside Docker
    const result = await executeCode(job.data);
    
    console.log(`[Executor] Job ${job.id} completed with status: ${result.status}`);

    // Publish the result to a Redis channel specific to this interview room
    // The WebSocket server will listen to this channel and beam it to the frontend
    await pubClient.publish(`execution-results:${job.data.roomId}`, JSON.stringify(result));

    return result;
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error(`[Executor] Job ${job?.id} failed with error:`, err.message);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[Executor] Shutting down gracefully...");
  await worker.close();
  pubClient.quit();
  process.exit(0);
});