import { WebSocketServer, WebSocket } from 'ws';

const ridePath = /^\/api\/rides\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/live$/i;

export function attachRideSockets(server, { updates, loadRide, allowedOrigins = [] }) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const rooms = new Map();
  let closed = false;
  const send = (socket, data) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 65536) { socket.terminate(); return; }
    socket.send(JSON.stringify(data));
  };
  async function refresh(room) {
    if (room.reading) { room.pending = true; return; }
    room.reading = true;
    try {
      do {
        room.pending = false;
        const ride = await loadRide(room.id);
        if (closed) return;
        if (!ride) {
          for (const socket of room.clients) socket.close(1008, 'Ride not found');
          return;
        }
        for (const socket of room.clients) send(socket, { type: 'ride.updated', ride });
      } while (room.pending && room.clients.size && !closed);
    } catch {
      for (const socket of room.clients) {
        send(socket, { type: 'ride.error', message: 'Use Refresh status to check your ride.' });
        socket.close(1011, 'Ride status unavailable');
      }
    } finally { room.reading = false; }
  }
  sockets.on('connection', (socket, _request, id) => {
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    socket.on('error', () => {});
    // Booking actions stay on HTTP; a connection watches one ride only.
    socket.on('message', () => socket.close(1008, 'Use the HTTP API for actions'));
    let room = rooms.get(id);
    if (!room) {
      room = { id, clients: new Set(), reading: false, pending: false };
      room.unsubscribe = updates.subscribe(id, () => { void refresh(room); });
      rooms.set(id, room);
    }
    room.clients.add(socket);
    socket.on('close', () => {
      room.clients.delete(socket);
      if (!room.clients.size) { room.unsubscribe(); rooms.delete(id); }
    });
    // Subscribe before reading so changes during initial loading are not missed.
    void refresh(room);
  });
  const upgrade = (request, socket, head) => {
    let match;
    try { match = new URL(request.url, 'http://localhost').pathname.match(ridePath); } catch {}
    const reject = code => { socket.end(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`); };
    if (!match || closed) { reject('404 Not Found'); return; }
    const origin = request.headers.origin;
    let sameOrigin = false;
    try {
      const parsed = new URL(origin);
      sameOrigin = ['http:', 'https:'].includes(parsed.protocol) && parsed.host === request.headers.host;
    } catch {}
    if (origin && !sameOrigin && !allowedOrigins.includes(origin)) { reject('403 Forbidden'); return; }
    sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws, request, match[1].toLowerCase()));
  };
  server.on('upgrade', upgrade);
  const stopResync = updates.onResync(() => {
    for (const room of rooms.values()) void refresh(room);
  });
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!socket.alive) { socket.terminate(); continue; }
      socket.alive = false;
      socket.ping();
    }
  }, 30000);
  heartbeat.unref();
  return {
    close() {
      closed = true;
      clearInterval(heartbeat);
      server.off('upgrade', upgrade);
      stopResync();
      for (const room of rooms.values()) room.unsubscribe();
      rooms.clear();
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
    },
  };
}
