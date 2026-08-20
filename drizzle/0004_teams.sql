-- 幂等改写(生产事故 2026-08-20):drizzle 的 migrator 在事务**外**读 __drizzle_migrations
-- 的最新 created_at,再进事务应用。两个进程(启动时的 run-seed.ts 与 server.ts 各调一次
-- getDb())可以都读到"最新是 0003",随后一个拿到 agents 的 ACCESS EXCLUSIVE 锁应用并提交,
-- 另一个在锁上等、等到后重复执行 ADD COLUMN → 42701 column already exists → 进程退出、
-- 启动链中断。原生成的非幂等 DDL 让这个竞态成为致命错误;下面三条语句在"列/约束已存在"
-- 与"全新库"两种状态下结果相同,竞态最坏只是白做一次功。
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "team_id" text;--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_team_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_team_id_agents_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
