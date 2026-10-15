import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import cors from 'cors';
import dotenv from 'dotenv';
import { Queue } from "bullmq";
import { describeRedis, getRedisUrl, redisOptionsFromUrl } from './redis.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// CLIENT_URL may hold several comma-separated origins, e.g.
// "https://interviewai-nine-theta.vercel.app,https://my-domain.com"
const allowedOrigins = new Set(
  (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);
if (!isProduction) {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://127.0.0.1:3000');
}
if (allowedOrigins.size === 0) {
  console.warn('[WS] CLIENT_URL is not set: browsers from every origin will be rejected.');
}

const isAllowedOrigin = (origin: string | undefined) =>
  // Requests without an Origin header come from non-browser clients (health checks, scripts).
  !origin || allowedOrigins.has(origin);

const app = express();
app.use(cors({ origin: [...allowedOrigins], credentials: true }));

const httpServer = createServer(app);

const redisUrl = getRedisUrl();
const redisOptions = redisOptionsFromUrl(redisUrl);
console.log(`[WS] Using Redis at ${describeRedis(redisUrl)}`);

const pubClient = new Redis(redisOptions);
const subClient = pubClient.duplicate();
const resultSubClient = pubClient.duplicate();

for (const [name, client] of [['pub', pubClient], ['sub', subClient], ['results', resultSubClient]] as const) {
  client.on('error', (err) => console.error(`[Redis:${name}] ${err.message}`));
  client.on('ready', () => console.log(`[Redis:${name}] ready`));
}

const QUEUE_NAME = "code-execution-queue";
// Written by apps/code-executor every 30s with a 90s expiry.
const WORKER_HEARTBEAT_KEY = "code-executor:heartbeat";

const executionQueue = new Queue(QUEUE_NAME, {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
executionQueue.on('error', (err) => console.error(`[Queue] ${err.message}`));

const io = new Server(httpServer, {
  cors: {
    origin: [...allowedOrigins],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // The cors option only covers HTTP long-polling; this also checks WebSocket upgrades.
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    const allowed = isAllowedOrigin(origin);
    if (!allowed) console.warn(`[WS] Rejected connection from origin ${origin}`);
    callback(null, allowed);
  },
  adapter: createAdapter(pubClient, subClient)
});

resultSubClient.psubscribe("execution-results:*", (err) => {
  if (err) {
    console.error("Failed to subscribe to execution results", err);
  }
});

resultSubClient.on("pmessage", (pattern, channel, message) => {
  const roomId = channel.split(":")[1];
  try {
    const result = JSON.parse(message);
    io.to(roomId).emit("execution-result", result);
  } catch (err) {
    console.error(`[WS] Ignoring malformed execution result on ${channel}`);
  }
});

app.get('/', (_req, res) => {
  res.send('InterviewAI WebSocket server');
});

// Render health check. Reports Redis and worker state, but stays 200 while the
// process is up so a short Redis blip does not take the socket server offline.
app.get('/health', async (_req, res) => {
  let workerOnline: boolean | null = null;
  try {
    workerOnline = (await pubClient.exists(WORKER_HEARTBEAT_KEY)) === 1;
  } catch {
    workerOnline = null;
  }
  res.json({
    status: 'ok',
    redis: pubClient.status,
    codeExecutorOnline: workerOnline,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join-room', (roomId: string) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
    socket.to(roomId).emit('user-joined', { socketId: socket.id });
  });

  socket.on('code-change', ({ roomId, code }) => {
    socket.to(roomId).emit('code-update', code);
  });

  socket.on('run-code', async ({ roomId, code, language, userId }) => {
    console.log(`[WS] Queuing execution for room ${roomId}`);

    const fail = (output: string) =>
      socket.emit('execution-result', {
        roomId,
        userId: userId || socket.id,
        status: 'error',
        output,
        executionTimeMs: 0,
      });

    try {
      const workerOnline = (await pubClient.exists(WORKER_HEARTBEAT_KEY)) === 1;
      if (!workerOnline) {
        fail('The code-execution worker is offline, so code cannot be run right now.');
        return;
      }

      await executionQueue.add('execute', {
        roomId,
        userId: userId || socket.id,
        language,
        code,
      });

      io.to(roomId).emit('execution-queued', {
        message: 'Code execution queued...',
      });
    } catch (err: any) {
      console.error(`[WS] Failed to queue execution: ${err?.message}`);
      fail('Could not queue code execution. Please try again.');
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = Number(process.env.PORT) || 8080;

// Bind to 0.0.0.0 so Render (and Docker) can route traffic to the process.
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`[WS] Allowed origins: ${[...allowedOrigins].join(', ') || '(none)'}`);
});

// Render sends SIGTERM on deploys and restarts.
const shutdown = async () => {
  console.log('[WS] Shutting down...');
  io.close();
  await executionQueue.close().catch(() => {});
  await Promise.all([pubClient, subClient, resultSubClient].map((c) => c.quit().catch(() => {})));
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
