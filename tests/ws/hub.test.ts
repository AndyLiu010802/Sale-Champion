import { describe, it, expect, beforeEach } from 'vitest';
import { getHub, resetHub, type HubSocket } from '@/lib/ws/hub';
import type { ServerEvent } from '@/lib/ws/protocol';

function fakeSocket() {
  const sent: string[] = [];
  let closed = false;
  const socket: HubSocket = {
    send(data: string) { sent.push(data); },
    close() { closed = true; },
  };
  return { socket, sent, isClosed: () => closed };
}

function throwingSocket(): HubSocket {
  return {
    send() { throw new Error('socket dead'); },
    close() {},
  };
}

const PONG: ServerEvent = { type: 'pong' };
const CONFIG: ServerEvent = { type: 'config.updated' };

describe('hub', () => {
  beforeEach(() => { resetHub(); });

  it('getHub returns a global singleton until resetHub', () => {
    const a = getHub();
    expect(getHub()).toBe(a);
    resetHub();
    expect(getHub()).not.toBe(a);
  });

  it('register + sendToScreen delivers the JSON-serialized event even when unpaired', () => {
    const hub = getHub();
    const tv = fakeSocket();
    hub.register('s1', tv.socket, false);
    hub.sendToScreen('s1', PONG);
    expect(tv.sent).toEqual([JSON.stringify(PONG)]);
  });

  it('sendToScreen to an unknown screen is a no-op', () => {
    expect(() => getHub().sendToScreen('nope', PONG)).not.toThrow();
  });

  it('broadcast reaches only paired sockets', () => {
    const hub = getHub();
    const paired = fakeSocket();
    const pending = fakeSocket();
    hub.register('s1', paired.socket, true);
    hub.register('s2', pending.socket, false);
    hub.broadcast(CONFIG);
    expect(paired.sent).toEqual([JSON.stringify(CONFIG)]);
    expect(pending.sent).toEqual([]);
  });

  it('markPaired upgrades a pending connection to receive broadcasts', () => {
    const hub = getHub();
    const tv = fakeSocket();
    hub.register('s1', tv.socket, false);
    hub.markPaired('s1');
    hub.broadcast(CONFIG);
    expect(tv.sent).toEqual([JSON.stringify(CONFIG)]);
  });

  it('re-registering the same screenId closes the old socket and routes to the new one', () => {
    const hub = getHub();
    const oldSock = fakeSocket();
    const newSock = fakeSocket();
    hub.register('s1', oldSock.socket, true);
    hub.register('s1', newSock.socket, true);
    expect(oldSock.isClosed()).toBe(true);
    hub.sendToScreen('s1', PONG);
    expect(oldSock.sent).toEqual([]);
    expect(newSock.sent).toEqual([JSON.stringify(PONG)]);
    // 被顶掉的旧 socket 随后触发 close → unregister,不得把新连接踢下线
    hub.unregister(oldSock.socket);
    expect(hub.isOnline('s1')).toBe(true);
  });

  it('re-registering the same socket under a new screenId evicts the old screenId', () => {
    const hub = getHub();
    const sock = fakeSocket();
    hub.register('A', sock.socket, true);
    hub.register('B', sock.socket, true);
    expect(hub.isOnline('A')).toBe(false);
    expect(hub.isOnline('B')).toBe(true);
    expect(hub.onlineScreenIds()).toEqual(['B']);
    hub.unregister(sock.socket);
    expect(hub.isOnline('A')).toBe(false);
    expect(hub.isOnline('B')).toBe(false);
  });

  it('broadcast keeps delivering to healthy sockets when one throws mid-iteration', () => {
    const hub = getHub();
    const good1 = fakeSocket();
    const bad = throwingSocket();
    const good2 = fakeSocket();
    hub.register('s1', good1.socket, true);
    hub.register('s2', bad, true);
    hub.register('s3', good2.socket, true);
    hub.broadcast(CONFIG);
    expect(good1.sent).toEqual([JSON.stringify(CONFIG)]);
    expect(good2.sent).toEqual([JSON.stringify(CONFIG)]);
    expect(hub.isOnline('s2')).toBe(false);
  });

  it('unregister removes the screen', () => {
    const hub = getHub();
    const tv = fakeSocket();
    hub.register('s1', tv.socket, true);
    hub.unregister(tv.socket);
    expect(hub.isOnline('s1')).toBe(false);
    expect(hub.onlineScreenIds()).toEqual([]);
  });

  it('a send failure unregisters the connection instead of throwing', () => {
    const hub = getHub();
    hub.register('s1', throwingSocket(), true);
    expect(() => hub.broadcast(CONFIG)).not.toThrow();
    expect(hub.isOnline('s1')).toBe(false);
  });

  it('isOnline / onlineScreenIds reflect current connections', () => {
    const hub = getHub();
    const a = fakeSocket();
    const b = fakeSocket();
    hub.register('a', a.socket, true);
    hub.register('b', b.socket, false);
    expect(hub.isOnline('a')).toBe(true);
    expect(hub.isOnline('b')).toBe(true);
    expect(hub.onlineScreenIds().sort()).toEqual(['a', 'b']);
  });
});
