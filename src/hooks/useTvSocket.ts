'use client';

import { useEffect, useRef, useState } from 'react';
import type { CelebrationPayload, DataDomain, ServerEvent } from '@/lib/ws/protocol';
import type { TvScreenInfo } from '@/lib/types';

export type TvPhase = 'connecting' | 'pairing' | 'paired' | 'offline';

export type TvSocketHandlers = {
  onCelebration(p: CelebrationPayload): void;
  onDataUpdated(domain: DataDomain): void;
  onConfigUpdated(): void;
  onPaired(screen: TvScreenInfo): void;
  onUnpaired(): void;
};

export type TvSocketState = { phase: TvPhase; pairCode: string | null; screen: TvScreenInfo | null };

const TOKEN_KEY = 'tv_device_token';
const NAME_KEY = 'tv_screen_name';
const PING_INTERVAL_MS = 30_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

type RegisterResponse = { data: { screenId: string; pairCode: string; expiresAt: string } };

// localStorage can throw (privacy mode, disabled storage, quota) — fall back to an
// in-memory map so pairing still works for the current session; it just won't
// survive a reload in that case.
const memoryStore = new Map<string, string>();
const safeStorage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return memoryStore.get(key) ?? null; }
  },
  set(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* fall through */ }
    memoryStore.set(key, value);
  },
  remove(key: string): void {
    try { localStorage.removeItem(key); } catch { /* fall through */ }
    memoryStore.delete(key);
  },
};

export function useTvSocket(handlers: TvSocketHandlers): TvSocketState {
  const [state, setState] = useState<TvSocketState>({ phase: 'connecting', pairCode: null, screen: null });

  // Keep the latest handlers in a ref so reconnect closures never call stale callbacks.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let stopped = false;
    let ws: WebSocket | null = null;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    // Timestamp of the last message received on the current connection (any server
    // event counts as alive, not just pong). Used by the ping loop to detect a
    // half-open socket that never errors/closes on its own.
    let lastServerMessageAt = Date.now();

    const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

    const stopPing = () => {
      if (pingTimer !== null) { clearInterval(pingTimer); pingTimer = null; }
    };

    const clearExpiry = () => {
      if (expiryTimer !== null) { clearTimeout(expiryTimer); expiryTimer = null; }
    };

    /** Close the current socket without triggering its onclose reconnect logic. */
    const dropSocket = () => {
      // Defensive cleanup: every path that tears down the current connection should
      // also cancel any pending reconnect so we never end up with two scheduled.
      if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) {
        ws.onclose = null;
        ws.onmessage = null;
        ws.onerror = null;
        try { ws.close(); } catch { /* ignore */ }
        ws = null;
      }
      stopPing();
    };

    /** Exponential backoff: 1s, 2s, 4s ... capped at 30s, plus 0-30% jitter. */
    const scheduleRetry = (fn: () => void) => {
      const base = Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_MAX_MS);
      const jitter = Math.random() * 0.3 * base;
      attempts += 1;
      reconnectTimer = setTimeout(fn, base + jitter);
    };

    const handleEvent = (event: ServerEvent) => {
      // Any message from the server — not just pong — proves the connection is alive.
      lastServerMessageAt = Date.now();
      switch (event.type) {
        case 'paired':
          safeStorage.set(TOKEN_KEY, event.deviceToken);
          safeStorage.set(NAME_KEY, event.screen.name);
          clearExpiry();
          setState({ phase: 'paired', pairCode: null, screen: event.screen });
          handlersRef.current.onPaired(event.screen);
          break;
        case 'celebration.play':
          handlersRef.current.onCelebration(event.celebration);
          break;
        case 'data.updated':
          handlersRef.current.onDataUpdated(event.domain);
          break;
        case 'config.updated':
          handlersRef.current.onConfigUpdated();
          break;
        case 'screen.updated':
          safeStorage.set(NAME_KEY, event.screen.name);
          setState((s) => ({ ...s, screen: event.screen }));
          break;
        case 'screen.unpaired':
          // Admin unpaired this TV: forget the token and go get a fresh pair code.
          safeStorage.remove(TOKEN_KEY);
          safeStorage.remove(NAME_KEY);
          handlersRef.current.onUnpaired();
          dropSocket();
          clearExpiry();
          attempts = 0;
          setState({ phase: 'connecting', pairCode: null, screen: null });
          void register();
          break;
        case 'pong':
          break;
      }
    };

    /** Shared "connection is gone" handling for both a real close and a watchdog-detected half-open socket. */
    const handleDisconnect = () => {
      stopPing();
      const token = safeStorage.get(TOKEN_KEY);
      if (token) {
        setState((s) => ({ ...s, phase: 'offline' }));
        scheduleRetry(connect);
      } else {
        clearExpiry();
        setState({ phase: 'connecting', pairCode: null, screen: null });
        scheduleRetry(() => void register());
      }
    };

    const openSocket = (hello: Record<string, unknown>, phaseOnOpen: TvPhase) => {
      dropSocket();
      const socket = new WebSocket(wsUrl());
      ws = socket;
      socket.onopen = () => {
        if (stopped) return;
        attempts = 0;
        lastServerMessageAt = Date.now();
        socket.send(JSON.stringify({ type: 'hello', ...hello }));
        setState((s) => ({ ...s, phase: phaseOnOpen }));
        pingTimer = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          // Half-open connection: the socket looks OPEN but nothing has arrived in
          // over two ping intervals (plus slack) — the server side is presumably
          // gone without a close frame ever reaching us. Force a reconnect instead
          // of waiting indefinitely.
          if (Date.now() - lastServerMessageAt > PING_INTERVAL_MS * 2 + 5_000) {
            dropSocket();
            handleDisconnect();
            return;
          }
          socket.send(JSON.stringify({ type: 'ping' }));
        }, PING_INTERVAL_MS);
      };
      socket.onmessage = (ev) => {
        if (stopped) return;
        try {
          handleEvent(JSON.parse(String(ev.data)) as ServerEvent);
        } catch (err) {
          console.warn('tv socket: bad message', err);
        }
      };
      socket.onerror = () => {
        try { socket.close(); } catch { /* ignore */ }
      };
      socket.onclose = () => {
        if (stopped || ws !== socket) return;
        ws = null;
        handleDisconnect();
      };
    };

    async function register(): Promise<void> {
      if (stopped) return;
      try {
        const res = await fetch('/api/tv/register', { method: 'POST' });
        if (!res.ok) throw new Error(`register failed: ${res.status}`);
        const json = (await res.json()) as RegisterResponse;
        if (stopped) return;
        const { screenId, pairCode, expiresAt } = json.data;
        setState({ phase: 'connecting', pairCode, screen: null });
        clearExpiry();
        const untilExpiry = new Date(expiresAt).getTime() - Date.now();
        expiryTimer = setTimeout(() => {
          // Pair code expired unclaimed: drop this registration and fetch a fresh code.
          dropSocket();
          attempts = 0;
          void register();
        }, Math.max(untilExpiry, 1_000));
        openSocket({ screenId, pairCode }, 'pairing');
      } catch {
        if (stopped) return;
        scheduleRetry(() => void register());
      }
    }

    function connect(): void {
      if (stopped) return;
      const token = safeStorage.get(TOKEN_KEY);
      if (!token) {
        void register();
        return;
      }
      openSocket({ deviceToken: token }, 'paired');
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      clearExpiry();
      dropSocket();
    };
  }, []);

  return state;
}
