# Chat Realtime Deployment Guide

## Current decision

Current production mode does **not** enable WebSocket realtime chat.

What is already active now:
- shared read-cache for chat snapshot reads
- `sinceId` delta sync
- frontend polling fallback

This means:
- chat works normally
- messages are near-realtime by polling
- no Redis or persistent WebSocket service is required yet

## When to enable realtime

Enable realtime only when these are true:
- polling delay is no longer acceptable
- you are willing to maintain one extra Redis service
- you are willing to maintain one persistent Node.js process

## Recommended stack

- Existing website / API: keep current platform
- Redis: Upstash Redis
- WebSocket server: Fly.io

Reason:
- current `api/` endpoints fit serverless well
- WebSocket fan-out needs a long-running process
- Redis is used as pub/sub between API and WebSocket server

## Architecture

```text
Browser
  |- HTTP -> existing website / API platform
  |- WebSocket -> Fly.io chat realtime service

API /api/chat
  |- write chat message
  |- publish to Redis

Fly.io realtime service
  |- subscribe Redis channel
  |- push message to connected clients
```

## Required services later

### 1. Upstash Redis

Create one Redis database in Upstash.

You will need one connection string such as:

```env
REALTIME_REDIS_URL=rediss://default:<password>@<host>:6379
```

The app also accepts:

```env
REDIS_URL=rediss://default:<password>@<host>:6379
```

Use `REALTIME_REDIS_URL` as the primary variable.

### 2. Fly.io service

Deploy the WebSocket server from this repository.

Runtime command:

```bash
npm run chat:realtime
```

This starts:

- [scripts/chat-realtime-server.mjs](C:\Users\CPXru\Desktop\thumb\program\device-linker-api\scripts\chat-realtime-server.mjs)

## Environment variables

### On existing website / API platform

Set:

```env
REALTIME_REDIS_URL=<same Upstash Redis URL>
```

Why:
- `/api/chat` must publish messages to Redis
- without this, the WebSocket service will not receive new messages

### On Fly.io realtime service

Set:

```env
REALTIME_REDIS_URL=<same Upstash Redis URL>
CHAT_REALTIME_PORT=8080
CHAT_REALTIME_PATH=/chat
```

## Fly.io deployment outline

### Install and login

```bash
fly auth login
```

### Launch app

Run at repository root:

```bash
fly launch
```

### Recommended `fly.toml`

Reference configuration:

```toml
app = "your-chat-app"

[env]
  CHAT_REALTIME_PORT = "8080"
  CHAT_REALTIME_PATH = "/chat"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

Important points:
- `internal_port` must match `CHAT_REALTIME_PORT`
- `min_machines_running = 1` keeps the process alive
- do not allow the machine to sleep if realtime chat is expected

### Set secrets

```bash
fly secrets set REALTIME_REDIS_URL="rediss://default:<password>@<host>:6379"
```

### Deploy

```bash
fly deploy
```

Expected resulting WebSocket URL:

```text
wss://<your-fly-app>.fly.dev/chat
```

## Frontend setting required later

If the WebSocket server is **not** on the same host as the website, expose this variable before loading chat:

```html
<script>
window.CHAT_REALTIME_URL = "wss://your-chat-app.fly.dev/chat";
</script>
```

If omitted, frontend will default to:

```text
wss://current-host/chat
```

That only works when the current host also serves the realtime endpoint.

## Verification checklist

After enabling realtime later, verify:

1. chat page loads and still receives room snapshot
2. two logged-in browsers join the same room
3. browser A sends one message
4. browser B receives it almost immediately
5. if WebSocket disconnects, frontend falls back to polling automatically

## Current production-safe choice

If you want the lowest-maintenance setup, keep realtime disabled for now.

That means:
- do not deploy Fly.io chat service yet
- do not configure `window.CHAT_REALTIME_URL` yet
- Redis is optional until realtime is actually enabled

The current codebase will continue to use HTTP snapshot plus delta polling.

Realtime is now **opt-in**.

If you do nothing:
- frontend will stay on polling mode
- it will not attempt WebSocket connection
- it will not keep retrying `/chat`

## Related files

- [api/chat.js](C:\Users\CPXru\Desktop\thumb\program\device-linker-api\api\chat.js)
- [js/chat.js](C:\Users\CPXru\Desktop\thumb\program\device-linker-api\js\chat.js)
- [lib/chat-store.js](C:\Users\CPXru\Desktop\thumb\program\device-linker-api\lib\chat-store.js)
- [lib/realtime-bus.js](C:\Users\CPXru\Desktop\thumb\program\device-linker-api\lib\realtime-bus.js)
- [scripts/chat-realtime-server.mjs](C:\Users\CPXru\Desktop\thumb\program\device-linker-api\scripts\chat-realtime-server.mjs)

## Realtime opt-in later

When you are ready to enable realtime later, use one of these:

### Option A: explicit external WebSocket URL

```html
<script>
window.CHAT_REALTIME_URL = "wss://your-chat-app.fly.dev/chat";
</script>
```

### Option B: same host `/chat`

Use this only if your current site host also exposes the realtime endpoint:

```html
<script>
window.CHAT_REALTIME_ENABLED = true;
</script>
```

Without either of the two settings above, chat stays in polling mode by design.
