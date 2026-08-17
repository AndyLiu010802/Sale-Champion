import type { ServerEvent } from './protocol';

export type HubSocket = { send(data: string): void; close(): void };

export type Hub = {
  register(screenId: string, socket: HubSocket, paired: boolean): void;
  unregister(socket: HubSocket): void;
  markPaired(screenId: string): void;
  sendToScreen(screenId: string, event: ServerEvent): void;
  broadcast(event: ServerEvent): void;
  isOnline(screenId: string): boolean;
  onlineScreenIds(): string[];
};

type Entry = { socket: HubSocket; paired: boolean };

function createHub(): Hub {
  const byScreen = new Map<string, Entry>();
  const bySocket = new Map<HubSocket, string>();

  function unregister(socket: HubSocket): void {
    const screenId = bySocket.get(socket);
    if (screenId === undefined) return;
    bySocket.delete(socket);
    const entry = byScreen.get(screenId);
    if (entry && entry.socket === socket) byScreen.delete(screenId);
  }

  function safeSend(socket: HubSocket, event: ServerEvent): void {
    try {
      socket.send(JSON.stringify(event));
    } catch {
      unregister(socket);
    }
  }

  return {
    register(screenId, socket, paired) {
      const existing = byScreen.get(screenId);
      if (existing && existing.socket !== socket) {
        bySocket.delete(existing.socket);
        try {
          existing.socket.close();
        } catch {
          // old socket may already be dead; ignore
        }
      }
      byScreen.set(screenId, { socket, paired });
      bySocket.set(socket, screenId);
    },
    unregister,
    markPaired(screenId) {
      const entry = byScreen.get(screenId);
      if (entry) entry.paired = true;
    },
    sendToScreen(screenId, event) {
      const entry = byScreen.get(screenId);
      if (entry) safeSend(entry.socket, event);
    },
    broadcast(event) {
      // 快照遍历:safeSend 失败会在遍历中修改 Map
      for (const entry of [...byScreen.values()]) {
        if (entry.paired) safeSend(entry.socket, event);
      }
    },
    isOnline(screenId) {
      return byScreen.has(screenId);
    },
    onlineScreenIds() {
      return [...byScreen.keys()];
    },
  };
}

type GlobalWithHub = typeof globalThis & { __tvHub?: Hub };

export function getHub(): Hub {
  const g = globalThis as GlobalWithHub;
  if (!g.__tvHub) g.__tvHub = createHub();
  return g.__tvHub;
}

/** Tests only. */
export function resetHub(): void {
  (globalThis as GlobalWithHub).__tvHub = undefined;
}
