import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import type { Db } from '@/lib/db';
import { agents, orgs } from '@/lib/db/schema';
import { getHub } from '@/lib/ws/hub';
import type { ServerEvent } from '@/lib/ws/protocol';
import { runBirthdayTick } from '@/server/bootstrap';

const AT_ELEVEN = new Date(2026, 7, 18, 11, 0, 0);   // local 2026-08-18 11:00
const NOT_ELEVEN = new Date(2026, 7, 18, 10, 59, 0); // local 2026-08-18 10:59
const TODAY_YMD = '2026-08-18';
const TODAY_MMDD = '08-18';

let db: Db;
let basics: Basics;
let events: ServerEvent[];

beforeEach(async () => {
  db = await freshDb();
  basics = await seedBasics(db);
  events = [];
  getHub().register(
    'screen-test',
    { send: (data: string) => events.push(JSON.parse(data) as ServerEvent), close: () => {} },
    true,
  );
});

async function insertMember(
  over: Partial<typeof agents.$inferInsert> & { name: string },
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(agents).values({ id, orgId: basics.orgId, ...over });
  return id;
}

async function orgMark(): Promise<string | null> {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, basics.orgId));
  return org.lastBirthdayBroadcastDate;
}

describe('runBirthdayTick', () => {
  it('at 11:00 broadcasts for a matching birthday and writes the dedupe mark', async () => {
    const bobId = await insertMember({ name: 'Bob Birthday', birthday: TODAY_MMDD });
    await runBirthdayTick(db, getHub(), AT_ELEVEN);

    expect(events).toEqual([
      {
        type: 'celebration.play',
        celebration: {
          kind: 'birthday',
          agentId: bobId,
          name: 'Bob Birthday',
          photoUrl: null,
          durationSec: 18,
        },
      },
    ]);
    expect(await orgMark()).toBe(TODAY_YMD);

    // A second tick in the same minute (or after a process restart) must not replay.
    await runBirthdayTick(db, getHub(), AT_ELEVEN);
    expect(events).toHaveLength(1);
  });

  it('does nothing outside 11:00', async () => {
    await insertMember({ name: 'Bob Birthday', birthday: TODAY_MMDD });
    await runBirthdayTick(db, getHub(), NOT_ELEVEN);
    expect(events).toEqual([]);
    expect(await orgMark()).toBeNull();
  });

  it('skips when the mark already says today', async () => {
    await insertMember({ name: 'Bob Birthday', birthday: TODAY_MMDD });
    await db.update(orgs)
      .set({ lastBirthdayBroadcastDate: TODAY_YMD })
      .where(eq(orgs.id, basics.orgId));
    await runBirthdayTick(db, getHub(), AT_ELEVEN);
    expect(events).toEqual([]);
  });

  it('writes no mark when nobody has a birthday today', async () => {
    await insertMember({ name: 'No Match', birthday: '01-01' });
    await runBirthdayTick(db, getHub(), AT_ELEVEN);
    expect(events).toEqual([]);
    expect(await orgMark()).toBeNull();
  });

  it('excludes inactive members', async () => {
    await insertMember({ name: 'Gone Away', birthday: TODAY_MMDD, active: false });
    await runBirthdayTick(db, getHub(), AT_ELEVEN);
    expect(events).toEqual([]);
    expect(await orgMark()).toBeNull();
  });

  it('broadcasts for staff members too', async () => {
    const staffId = await insertMember({ name: 'Sam Staff', birthday: TODAY_MMDD, role: 'staff' });
    await runBirthdayTick(db, getHub(), AT_ELEVEN);
    expect(events).toHaveLength(1);
    const first = events[0];
    if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
    if (first.celebration.kind !== 'birthday') throw new Error('expected birthday celebration');
    expect(first.celebration.agentId).toBe(staffId);
    expect(await orgMark()).toBe(TODAY_YMD);
  });

  it('broadcasts one event per celebrant, name ascending', async () => {
    await insertMember({ name: 'Zoe Late', birthday: TODAY_MMDD });
    await insertMember({ name: 'Abe Early', birthday: TODAY_MMDD, role: 'staff' });
    await runBirthdayTick(db, getHub(), AT_ELEVEN);
    expect(events).toHaveLength(2);
    const names = events.map((e) => {
      if (e.type !== 'celebration.play' || e.celebration.kind !== 'birthday') {
        throw new Error('unexpected event');
      }
      return e.celebration.name;
    });
    expect(names).toEqual(['Abe Early', 'Zoe Late']);
  });
});
