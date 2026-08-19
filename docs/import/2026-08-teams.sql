-- 真团队模型存量迁移(团队设计 §6):把三个存量"团队"成员行就地转成 Team,并建出各自的成员。
-- 幂等:转 Team 的 UPDATE 带 role='agent' 条件(第二遍是空操作);成员按 name 判重。
-- 前置:先跑 docs/import/2026-08-south-scorecard.sql —— Hill & Co / Team Cowley /
--       Team Brudenell 三行由它建出,本文件只改它们的 role 并挂成员。
-- 前置(重要):数据库中只能有一个 org,脚本全程用 (SELECT id FROM orgs LIMIT 1) 取组织,
-- 有多个 org 时会全部导入到 LIMIT 1 取到的那一个,与预期不符。运行前先核验:
--   SELECT count(*) FROM orgs; -- 应为 1,否则勿直接运行
-- 云端:Railway Postgres → Data 标签整贴执行;本地:npx tsx scripts/run-sql.ts docs/import/2026-08-teams.sql
-- 迁移后果:三队的历史业绩原地有效(业绩本就挂在这三行上);成员只作展示与庆祝照片用,
-- 不单独上榜、也不可再被录入业绩(录入下拉只出现 Team 与未归队 agent)。
-- 成员照片留空,后台 Team 页逐个补传。

-- ===== 1. 三行就地转 Team(团队行无生日)=====
UPDATE agents SET role = 'team', birthday = NULL, team_id = NULL
WHERE name IN ('Hill & Co', 'Team Cowley', 'Team Brudenell')
  AND role = 'agent'
  AND org_id = (SELECT id FROM orgs LIMIT 1);

-- ===== 2. 成员(7),按 name 判重,team_id 回查队名 =====
-- 每条都带 AND EXISTS(… role='team'):前置的 scorecard 导入没跑过时整段是空操作,
-- 而不是静默建出 7 个未挂队的成员(那些成员会直接上榜,是比报错更坏的失败方式)。
-- Hill & Co ← Marnie Hill、Martin Waldhoff
INSERT INTO agents (id, org_id, name, role, active, team_id)
SELECT 'ac200000-0000-4000-8000-000000000001', (SELECT id FROM orgs LIMIT 1), 'Marnie Hill', 'agent', true,
       (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Marnie Hill')
  AND EXISTS (SELECT 1 FROM agents WHERE name = 'Hill & Co' AND role = 'team');

INSERT INTO agents (id, org_id, name, role, active, team_id)
SELECT 'ac200000-0000-4000-8000-000000000002', (SELECT id FROM orgs LIMIT 1), 'Martin Waldhoff', 'agent', true,
       (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Martin Waldhoff')
  AND EXISTS (SELECT 1 FROM agents WHERE name = 'Hill & Co' AND role = 'team');

-- Team Cowley ← Nick Cowley、Haylee Abbott
INSERT INTO agents (id, org_id, name, role, active, team_id)
SELECT 'ac200000-0000-4000-8000-000000000003', (SELECT id FROM orgs LIMIT 1), 'Nick Cowley', 'agent', true,
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Nick Cowley')
  AND EXISTS (SELECT 1 FROM agents WHERE name = 'Team Cowley' AND role = 'team');

INSERT INTO agents (id, org_id, name, role, active, team_id)
SELECT 'ac200000-0000-4000-8000-000000000004', (SELECT id FROM orgs LIMIT 1), 'Haylee Abbott', 'agent', true,
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Haylee Abbott')
  AND EXISTS (SELECT 1 FROM agents WHERE name = 'Team Cowley' AND role = 'team');

-- Team Brudenell ← Alex Muller、Mark Brudenell、Eloise
INSERT INTO agents (id, org_id, name, role, active, team_id)
SELECT 'ac200000-0000-4000-8000-000000000005', (SELECT id FROM orgs LIMIT 1), 'Alex Muller', 'agent', true,
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Alex Muller')
  AND EXISTS (SELECT 1 FROM agents WHERE name = 'Team Brudenell' AND role = 'team');

INSERT INTO agents (id, org_id, name, role, active, team_id)
SELECT 'ac200000-0000-4000-8000-000000000006', (SELECT id FROM orgs LIMIT 1), 'Mark Brudenell', 'agent', true,
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Mark Brudenell')
  AND EXISTS (SELECT 1 FROM agents WHERE name = 'Team Brudenell' AND role = 'team');

INSERT INTO agents (id, org_id, name, role, active, team_id)
SELECT 'ac200000-0000-4000-8000-000000000007', (SELECT id FROM orgs LIMIT 1), 'Eloise', 'agent', true,
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Eloise')
  AND EXISTS (SELECT 1 FROM agents WHERE name = 'Team Brudenell' AND role = 'team');
