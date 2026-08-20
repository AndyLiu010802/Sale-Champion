-- 生产库上 agents.team_id 与一条自引用外键曾被手工加入(约束名未知),而 0004 的
-- DROP CONSTRAINT IF EXISTS 只按规范名删 —— 漏网那条会与规范外键并存于同一列:
-- 每次写入校验两遍,且手建那条若带 ON DELETE CASCADE,还会与 DELETE 路由
-- "删队先释放成员"的语义直接冲突。
--
-- 这里按**列**而非按名清空后重建,所以无论此前叫什么名字、有没有,都收敛到同一状态。
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'agents'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'agents'::regclass AND attname = 'team_id')]
  LOOP
    EXECUTE format('ALTER TABLE agents DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_team_id_agents_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
