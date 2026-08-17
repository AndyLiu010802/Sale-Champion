import type { Db } from './index';
import { orgs } from './schema';

let _orgId: string | undefined;

export async function getOrgId(db: Db): Promise<string> {
  if (_orgId) return _orgId;
  const rows = await db.select().from(orgs).limit(1);
  if (!rows[0]) throw new Error('No org found — run `npm run db:seed` first');
  _orgId = rows[0].id;
  return _orgId;
}

/** Tests only. */
export function resetOrgCache(): void { _orgId = undefined; }
