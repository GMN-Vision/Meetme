'use strict';

const http = require('http');
const { URL } = require('url');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const { broadcast, joinRoom, leaveRoom, getRoomSize, getCaptionHistory, recordCaption } = require('../ws/roomHub');
const { addCaption, getLastSummary, flushMeeting } = require('../summarizer');
const { addParticipant, removeParticipant, resolveSpeaker } = require('../participants');

// Track active bot processes
const activeBots = new Map();

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';

    request.on('data', (chunk) => {
      raw += chunk;

      if (raw.length > 1_000_000) {
        reject(new Error('Body too large'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

function createServer() {
  const port = Number(process.env.MEETING_AI_PORT || 4010);
  const host = process.env.MEETING_AI_HOST || '0.0.0.0';
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    response.setHeader('Access-Control-Allow-Origin', process.env.MEETING_AI_CORS_ORIGIN || '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/start-bot') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        ok: true,
        message: 'Bot disabled for testing',
      }));
      return;

      try {
        const body = await readJsonBody(request);
        const { meetingId, meetingUrl, botName, jwt, platform } = body;

        if (!meetingId || !meetingUrl) {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'meetingId and meetingUrl are required' }));
          return;
        }

        // Check if bot is already running for this meeting
        if (activeBots.has(meetingId)) {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true, message: 'Bot already running for this meeting' }));
          return;
        }

        console.log(`[bot-trigger] Starting bot for meeting ${meetingId}`);

        // Spawn bot process
        const botScript = path.join(__dirname, '..', 'bot', 'zoomBotAssemblyRunner.js');
        const botProcess = spawn('node', [botScript, meetingId, meetingUrl, botName || 'Melanam Bot'], {
          cwd: path.join(__dirname, '..', '..'),
          env: {
            ...process.env,
            BOT_JITSI_TOKEN: jwt || '',
            BOT_MEETING_PLATFORM: platform || '',
          },
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Log bot output
        if (botProcess.stdout) {
          botProcess.stdout.on('data', (data) => {
            console.log(`[bot:${meetingId}] ${data.toString().trim()}`);
          });
        }
        if (botProcess.stderr) {
          botProcess.stderr.on('data', (data) => {
            console.error(`[bot:${meetingId}] ERROR: ${data.toString().trim()}`);
          });
        }

        // Track bot process
        activeBots.set(meetingId, botProcess);

        // Cleanup when process exits
        botProcess.on('exit', (code) => {
          console.log(`[bot:${meetingId}] Exited with code ${code}`);
          activeBots.delete(meetingId);
        });

        botProcess.on('error', (err) => {
          console.error(`[bot:${meetingId}] Process error:`, err.message);
          activeBots.delete(meetingId);
        });

        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, message: 'Bot is starting', meetingId }));
      } catch (error) {
        console.error('[bot-trigger] Error:', error.message);
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to start bot' }));
      }
      return;
    }

    if (requestUrl.pathname.startsWith('/api/rooms/')) {
      const parts = requestUrl.pathname.split('/').filter(Boolean);
      const meetingId = parts[2];
      const action = parts[3];

      if (!meetingId) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // POST /api/rooms/:id/participants -> add participant mapping
      if (request.method === 'POST' && action === 'participants') {
        try {
          const body = await readJsonBody(request);
          const participantId = body.participantId || body.id || body.jid || body.participant;
          const displayName = body.displayName || body.name || body.email || '';

          if (!participantId) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'participantId is required' }));
            return;
          }

          addParticipant(meetingId, participantId, displayName);
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true }));
        } catch (err) {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Bad request' }));
        }

        return;
      }

      // GET /api/rooms/:id/captions -> return recent caption history for polling fallback
      if (request.method === 'GET' && action === 'captions') {
        try {
          const since = Number(requestUrl.searchParams.get('since') || '0');
          const history = getCaptionHistory(meetingId)
            .filter((item) => !since || (typeof item.timestamp === 'number' && item.timestamp > since));

          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true, captions: history }));
        } catch (err) {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' }));
        }

        return;
      }

      // GET /api/rooms/:id/summary -> return last summary
      if (request.method === 'GET' && action === 'summary') {
        try {
          const data = getLastSummary(meetingId);
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true, summary: data }));
        } catch (err) {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' }));
        }

        return;
      }

      // GET /api/rooms/:id/clients -> diagnostic: number of connected sockets
      if (request.method === 'GET' && action === 'clients') {
        try {
          const count = typeof getRoomSize === 'function' ? getRoomSize(meetingId) : 0;
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true, clients: count }));
        } catch (err) {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' }));
        }

        return;
      }

      // POST /api/rooms/:id/flush -> force summarizer to flush buffered captions immediately
      if (request.method === 'POST' && action === 'flush') {
        try {
          const result = await flushMeeting(meetingId);
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true, summary: result }));
        } catch (err) {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to flush' }));
        }

        return;
      }

      // POST /api/rooms/:id/captions -> caption payload
      if (request.method === 'POST' && action === 'captions') {
        try {
          const body = await readJsonBody(request);
          const payload = {
            type: 'caption',
            meetingId,
            text: String(body.text || '').trim(),
            speaker: body.speaker
              ? String(body.speaker).trim()
              : (body.speakerId ? `Speaker ${String(body.speakerId).trim()}` : 'Speaker'),
            speakerId: body.speakerId ? String(body.speakerId).trim() : undefined,
            final: Boolean(body.final),
            timestamp: typeof body.timestamp === 'number' ? body.timestamp : Date.now(),
          };

          if (!payload.text) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Caption text is required' }));
            return;
          }

          console.log(`[server] 📥 CAPTION RECEIVED: "${payload.text.slice(0, 60)}" | speaker=${payload.speaker || 'unknown'} | final=${payload.final}`);

          // Try to resolve a friendly speaker name if mapping exists
          try {
            const mapped =
              String(payload.speakerId || '').startsWith('diarized:')
                ? undefined
                : resolveSpeaker(meetingId, payload.speakerId) || resolveSpeaker(meetingId, payload.speaker);
            if (mapped) payload.speaker = mapped;
          } catch (err) {
            // ignore mapping errors
          }

          console.log(`[server] 📡 Broadcasting caption to meeting ${meetingId}`);
          recordCaption(meetingId, payload);
          broadcast(meetingId, payload);

          // Add caption to summarizer buffer (non-blocking)
          try {
            addCaption(meetingId, payload).catch((err) => console.error('[server] summarizer addCaption error', err && err.message));
          } catch (err) {
            console.error('[server] summarizer invocation error', err && err.message);
          }

          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true }));
        } catch (error) {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Bad request' }));
        }

        return;
      }

      // Unknown action under /api/rooms
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });

  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (!requestUrl.pathname.startsWith('/ws/')) {
      socket.destroy();
      return;
    }

    const meetingId = decodeURIComponent(requestUrl.pathname.split('/')[2] || '').trim();

    if (!meetingId) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, meetingId);
    });
  });

  wss.on('connection', (socket, request, meetingId) => {
    console.log(`[ws] ✅ CLIENT CONNECTED to meeting ${meetingId}`);
    joinRoom(meetingId, socket);

    socket.send(JSON.stringify({ type: 'connected', meetingId }));
    console.log(`[ws] 📤 Sent 'connected' message to client`);

    socket.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());

        if (payload.type === 'clear') {
          broadcast(meetingId, { type: 'cleared', meetingId });
          return;
        }

        if (payload.type === 'caption' && payload.text) {
          const captionPayload = {
            type: 'caption',
            meetingId,
            text: String(payload.text).trim(),
            speaker: payload.speaker ? String(payload.speaker).trim() : 'Speaker',
            speakerId: payload.speakerId ? String(payload.speakerId).trim() : undefined,
            final: Boolean(payload.final),
            timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
          };

          try {
            const mapped =
              String(captionPayload.speakerId || '').startsWith('diarized:')
                ? undefined
                : resolveSpeaker(meetingId, captionPayload.speakerId) || resolveSpeaker(meetingId, captionPayload.speaker);
            if (mapped) captionPayload.speaker = mapped;
          } catch (err) {
            // ignore mapping errors
          }

          recordCaption(meetingId, captionPayload);
          broadcast(meetingId, captionPayload);

          // forward to summarizer asynchronously
          try {
            addCaption(meetingId, captionPayload).catch((err) => console.error('[server] summarizer addCaption error', err && err.message));
          } catch (err) {
            console.error('[server] summarizer invocation error', err && err.message);
          }
        }
      } catch {
        // Ignore invalid payloads from clients.
      }
    });

    socket.on('close', () => {
      leaveRoom(meetingId, socket);
    });

    socket.on('error', () => {
      leaveRoom(meetingId, socket);
    });
  });

  return {
    start() {
      server.on('error', async (error) => {
        if (error && error.code === 'EADDRINUSE') {
          try {
            const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
            if (healthResponse.ok) {
              console.log(`[meeting-ai] already running on http://${host}:${port}`);
              process.exit(0);
              return;
            }
          } catch {
            // fall through to throw the original error
          }
        }

        throw error;
      });

      server.listen(port, host, () => {
        console.log(`[meeting-ai] listening on http://${host}:${port}`);
      });

      return server;
    },
  };
}

module.exports = {
  createServer,
};
