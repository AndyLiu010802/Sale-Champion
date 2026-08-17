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

    const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

    const stopPing = () => {
      if (pingTimer !== null) { clearInterval(pingTimer); pingTimer = null; }
    };

    const clearExpiry = () => {
      if (expiryTimer !== null) { clearTimeout(expiryTimer); expiryTimer = null; }
    };

    /** Close the current socket without triggering its onclose reconnect logic. */
    const dropSocket = () => {
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
      switch (event.type) {
        case 'paired':
          localStorage.setItem(TOKEN_KEY, event.deviceToken);
          localStorage.setItem(NAME_KEY, event.screen.name);
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
          localStorage.setItem(NAME_KEY, event.screen.name);
          setState((s) => ({ ...s, screen: event.screen }));
          break;
        case 'screen.unpaired':
          // Admin unpaired this TV: forget the token and go get a fresh pair code.
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(NAME_KEY);
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

    const openSocket = (hello: Record<string, unknown>, phaseOnOpen: TvPhase) => {
      dropSocket();
      const socket = new WebSocket(wsUrl());
      ws = socket;
      socket.onopen = () => {
        if (stopped) return;
        attempts = 0;
        socket.send(JSON.stringify({ type: 'hello', ...hello }));
        setState((s) => ({ ...s, phase: phaseOnOpen }));
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
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
        stopPing();
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
          setState((s) => ({ ...s, phase: 'offline' }));
          scheduleRetry(connect);
        } else {
          clearExpiry();
          setState({ phase: 'connecting', pairCode: null, screen: null });
          scheduleRetry(() => void register());
        }
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
      const token = localStorage.getItem(TOKEN_KEY);
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
