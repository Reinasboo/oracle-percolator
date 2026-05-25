import { io, Socket } from 'socket.io-client';
import { startDemoSocket } from '../mock/demo';

let socket: any = null;

function createMockSocket() {
  // Minimal mock socket interface compatible with our listeners
  const handlers: Record<string, Function[]> = {};
  const mock = {
    id: 'mock-socket',
    on(event: string, cb: Function) {
      handlers[event] = handlers[event] || [];
      handlers[event].push(cb);
    },
    off(event: string, cb?: Function) {
      if (!handlers[event]) return;
      if (!cb) {
        delete handlers[event];
        return;
      }
      handlers[event] = handlers[event].filter(fn => fn !== cb);
    },
    emit(event: string, payload?: any) {
      const fns = handlers[event] || [];
      fns.forEach(fn => {
        try { fn(payload); } catch (e) { console.error('mock handler error', e); }
      });
    },
    disconnect() {
      Object.keys(handlers).forEach(k=> delete handlers[k]);
    }
  };

  // Start demo generator that will call mock.emit
  const stop = startDemoSocket(mock as any, { tickMs: 2000, anomalyRate: 0.03 });
  // attach stop so callers can cleanup if needed
  (mock as any)._stopDemo = stop;

  return mock;
}

export function connectSocket(url = 'http://localhost:3000') {
  // Vite env var to force demo mode
  const useMock = (import.meta as any).env?.VITE_USE_MOCK === 'true';

  if (socket) return socket;

  if (useMock) {
    socket = createMockSocket();
    return socket;
  }

  try {
    socket = io(url, { transports: ['websocket'] });
    // If connection fails quickly, fallback to mock
    socket.on('connect_error', () => {
      console.warn('Socket connect_error, falling back to demo mock');
      if (socket) {
        try { socket.disconnect(); } catch (e) {}
      }
      socket = createMockSocket();
    });
    return socket as Socket;
  } catch (e) {
    console.warn('Socket.io client failed, using demo mock', e);
    socket = createMockSocket();
    return socket;
  }
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    if ((socket as any)._stopDemo) {
      try { (socket as any)._stopDemo(); } catch (e) {}
    }
    try { socket.disconnect(); } catch (e) {}
    socket = null;
  }
}
