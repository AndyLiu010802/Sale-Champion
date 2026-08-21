-- 幂等(生产事故 2026-08-20 的教训:非幂等 DDL 会让"列已存在"变成致命错误,进程在
-- server.listen() 之前退出,健康检查必挂)。全新库与已有该列的库跑出来结果相同。
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "color" text;
