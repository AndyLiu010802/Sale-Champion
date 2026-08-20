// 部署前的迁移步骤(Railway railway.json 的 deploy.preDeployCommand;本地 npm run db:migrate)。
// 与服务进程分开跑:请求容器只连库并校验 schema,不再做 DDL —— 见 src/lib/db/index.ts。
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { migrateToLatest } from '../src/lib/db';

migrateToLatest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] FAILED', err);
    process.exit(1);
  });
