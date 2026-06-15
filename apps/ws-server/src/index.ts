import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import cors from 'cors';
import dotenv from 'dotenv';
import { Queue } from "bullmq";

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const pubClient = new Redis(redisUrl);
const subClient = pubClient.duplicate();
const redisUrlObject = new URL(redisUrl);

const QUEUE_NAME = "code-execution-queue";

const executionQueue = new Queue(QUEUE_NAME, {
  connection: {
    host: redisUrlObject.hostname,
    port: Number(redisUrlObject.port) || 6379,
    password: redisUrlObject.password || undefined,
    db: redisUrlObject.pathname ? Number(redisUrlObject.pathname.slice(1)) || undefined : undefined,
  },
});

const resultSubClient = pubClient.duplicate();

resultSubClient.psubscribe("execution-results:*", (err) => {
  if (err) {
    console.error("Failed to subscribe to execution results", err);
  }
});

resultSubClient.on("pmessage", (pattern, channel, message) => {
  const roomId = channel.split(":")[1];
  const result = JSON.parse(message);

  io.to(roomId).emit("execution-result", result);
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  adapter: createAdapter(pubClient, subClient)
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

  await executionQueue.add('execute', {
    roomId,
    userId: userId || socket.id,
    language,
    code,
  });

  io.to(roomId).emit('execution-queued', {
    message: 'Code execution queued...',
  });
});

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 8080;

httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});