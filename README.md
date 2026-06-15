# InterviewAI

An AI-powered technical interview platform that simulates real coding interviews, evaluates candidate performance, and generates detailed assessment reports.

## Features

### Authentication

* GitHub OAuth login
* Google OAuth login
* Secure session management with Auth.js (NextAuth)

### AI Interviewer

* AI-powered interviewer using Google Gemini
* Dynamic interview conversations
* Code-aware feedback based on the candidate's current solution
* Personalized interview experience

### Real-Time Coding Environment

* Monaco Editor integration
* Multi-language support

  * JavaScript
  * Python
  * C++
  * C
  * Java
* Real-time collaborative editing with Socket.IO

### Secure Code Execution

* Docker-based sandboxed execution
* CPU and memory limits
* No network access during execution
* Isolated execution environment

### Interview Management

* Create interview rooms
* Track interview events
* Generate AI-powered evaluation reports
* Store interview history

### Analytics Dashboard

* Candidate performance tracking
* Historical interview reports
* Technical score visualization
* Communication score visualization

---

## Tech Stack

### Frontend

* Next.js 16
* React 19
* TypeScript
* Tailwind CSS
* Monaco Editor
* Recharts
* Socket.IO Client
* Shadcn UI

### Backend

* Next.js API Routes
* Socket.IO
* BullMQ
* Redis

### Database

* PostgreSQL
* Prisma ORM

### Authentication

* Auth.js (NextAuth v5)
* GitHub OAuth
* Google OAuth

### AI

* Google Gemini 2.5 Flash
* AI SDK

### Infrastructure

* Docker
* Redis
* PostgreSQL

### Monorepo

* Turborepo
* PNPM Workspaces

---

## Architecture

Candidate Browser
↓
Next.js Frontend
↓
Socket.IO Server
↓
BullMQ Queue
↓
Code Executor Worker
↓
Docker Sandbox
↓
Execution Results

AI Interview Chat
↓
Gemini API
↓
Interview Event Storage
↓
Report Generation

---

## Project Structure

```text
apps/
├── web/
│   ├── app/
│   ├── components/
│   └── api/
│
├── ws-server/
│   └── Socket.IO server
│
└── code-executor/
    └── Docker execution worker

packages/
└── database/
    ├── Prisma schema
    └── Database client
```

---

## Local Setup

### Clone Repository

```bash
git clone https://github.com/<your-username>/InterviewAI.git
cd InterviewAI
```

### Install Dependencies

```bash
pnpm install
```

### Configure Environment Variables

Create the required `.env` files and add:

```env
DATABASE_URL=
REDIS_URL=

AUTH_SECRET=

AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=

AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

GOOGLE_GENERATIVE_AI_API_KEY=
```

### Start Services

```bash
docker-compose up -d
```

### Run Database Migrations

```bash
pnpm prisma migrate dev
```

### Start Development Servers

```bash
pnpm dev
```


---

## Future Improvements

* Voice-based interviews
* Video interview support
* Company-specific interview templates
* Live interviewer participation
* Plagiarism detection
* Advanced candidate analytics
* Team recruiting dashboard

---

## License

MIT License
