// 删掉本地 PGlite 开发库并重新播种。生产库(DATABASE_URL)绝不会被碰到。
//
// 存在的理由:Windows 上 tsx watch 每次存盘都硬杀子进程,pg_control 与 pg_wal 迟早对不上,
// 下次启动 PGlite 直接 `Aborted()`。src/lib/db/index.ts 会尝试自动把坏目录挪走,但只要还有
// 进程攥着它,rename 就是 EPERM —— 这时用这条命令,一步到位。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.env.DATABASE_URL) {
  console.error('[db:reset] DATABASE_URL is set — this command only ever touches the local '
    + 'PGlite database. Unset it first if you meant to reset local dev data.');
  process.exit(1);
}

const dir = path.join(process.cwd(), '.data');
if (fs.existsSync(dir)) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`[db:reset] removed ${path.relative(process.cwd(), dir)}`);
  } catch (err) {
    console.error(`[db:reset] could not remove ${path.relative(process.cwd(), dir)}: `
      + `${(err as Error).message}\n`
      + '            Something still holds it — stop every running dev server and try again.');
    process.exit(1);
  }
} else {
  console.log('[db:reset] nothing to remove');
}

const seed = spawnSync('npx', ['tsx', 'src/lib/db/run-seed.ts', '--demo'],
  { stdio: 'inherit', shell: true });
process.exit(seed.status ?? 1);
