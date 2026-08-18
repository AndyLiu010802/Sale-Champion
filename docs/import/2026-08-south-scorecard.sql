-- SOUTH. SALES SCORECARD 真实数据导入:2026-08 明细 + 2026-07 补录(设计 §7/§7b)。
-- 幂等:成员按 name 判重;sales/listings 按 'Imported <月> …' 地址标记判重;appraisals 按固定 id 判重。
-- 前置:orgs 里已有组织(生产库已跑 seed;本地先 npm run db:seed)。
-- 前置(重要):数据库中只能有一个 org,脚本全程用 (SELECT id FROM orgs LIMIT 1) 取组织,
-- 有多个 org 时会全部导入到 LIMIT 1 取到的那一个,与预期不符。运行前先核验:
--   SELECT count(*) FROM orgs; -- 应为 1,否则勿直接运行
-- 云端:Railway Postgres → Data 标签整贴执行;本地:npx tsx scripts/run-sql.ts docs/import/2026-08-south-scorecard.sql
-- 还原规则:成交 sale_price_cents=0(仅佣金参与统计;SQL 直写不经 API,不触发庆祝);
-- 佣金按人头均摊到各行、余数进首行(7 月 Brudenell +4 分、Cowley +1 分);
-- 房源 status='sold'、$0(计入指标与转化率、不上 TV 在售页);小数房源份额单独一行(split 0.66/0.33);
-- 日期:8 月散布 01~17、7 月散布 01~31。

-- ===== 成员(7)=====
INSERT INTO agents (id, org_id, name, role, active)
SELECT 'ac100000-0000-4000-8000-000000000001', (SELECT id FROM orgs LIMIT 1), 'Chris Joyce', 'agent', true
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Chris Joyce');

INSERT INTO agents (id, org_id, name, role, active)
SELECT 'ac100000-0000-4000-8000-000000000002', (SELECT id FROM orgs LIMIT 1), 'John Loveluck', 'agent', true
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'John Loveluck');

INSERT INTO agents (id, org_id, name, role, active)
SELECT 'ac100000-0000-4000-8000-000000000003', (SELECT id FROM orgs LIMIT 1), 'Team Cowley', 'agent', true
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Team Cowley');

INSERT INTO agents (id, org_id, name, role, active)
SELECT 'ac100000-0000-4000-8000-000000000004', (SELECT id FROM orgs LIMIT 1), 'Michael Hatzinicolaou', 'agent', true
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Michael Hatzinicolaou');

INSERT INTO agents (id, org_id, name, role, active)
SELECT 'ac100000-0000-4000-8000-000000000005', (SELECT id FROM orgs LIMIT 1), 'Hill & Co', 'agent', true
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Hill & Co');

INSERT INTO agents (id, org_id, name, role, active)
SELECT 'ac100000-0000-4000-8000-000000000006', (SELECT id FROM orgs LIMIT 1), 'Kathy Roberts', 'agent', true
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Kathy Roberts');

INSERT INTO agents (id, org_id, name, role, active)
SELECT 'ac100000-0000-4000-8000-000000000007', (SELECT id FROM orgs LIMIT 1), 'Team Brudenell', 'agent', true
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Team Brudenell');

-- ===== 8 月成交(12 行;Σsplit=8;GCI 合计 10,834,400 分)=====
-- Chris Joyce:S3(1+1+1),$37,998 → 3 × 1,266,600
INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000001', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Aug sale #1 (Chris Joyce)', 0, 1266600, '2026-08-04', 1
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (Chris Joyce)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000002', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Aug sale #2 (Chris Joyce)', 0, 1266600, '2026-08-08', 1
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #2 (Chris Joyce)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000003', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Aug sale #3 (Chris Joyce)', 0, 1266600, '2026-08-13', 1
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #3 (Chris Joyce)');

-- John Loveluck:S2(1.0+0.8),$28,970 → 2 × 1,448,500
INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000004', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'John Loveluck' LIMIT 1),
       'Imported Aug sale #1 (John Loveluck)', 0, 1448500, '2026-08-05', 1
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (John Loveluck)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000005', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'John Loveluck' LIMIT 1),
       'Imported Aug sale #2 (John Loveluck)', 0, 1448500, '2026-08-11', 0.8
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #2 (John Loveluck)');

-- Team Cowley:S2(0.5+0.5),$13,148 → 2 × 657,400
INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000006', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Aug sale #1 (Team Cowley)', 0, 657400, '2026-08-06', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (Team Cowley)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000007', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Aug sale #2 (Team Cowley)', 0, 657400, '2026-08-12', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #2 (Team Cowley)');

-- Michael Hatzinicolaou:S2(0.5+0.5),$13,148 → 2 × 657,400
INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000008', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1),
       'Imported Aug sale #1 (Michael Hatzinicolaou)', 0, 657400, '2026-08-07', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (Michael Hatzinicolaou)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000009', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1),
       'Imported Aug sale #2 (Michael Hatzinicolaou)', 0, 657400, '2026-08-13', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #2 (Michael Hatzinicolaou)');

-- Hill & Co:S2(0.5+0.5),$11,000 → 2 × 550,000
INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000010', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1),
       'Imported Aug sale #1 (Hill & Co)', 0, 550000, '2026-08-03', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (Hill & Co)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000011', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1),
       'Imported Aug sale #2 (Hill & Co)', 0, 550000, '2026-08-15', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #2 (Hill & Co)');

-- Kathy Roberts:S1(0.2),$4,080 → 408,000
INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000012', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Kathy Roberts' LIMIT 1),
       'Imported Aug sale #1 (Kathy Roberts)', 0, 408000, '2026-08-10', 0.2
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (Kathy Roberts)');

-- ===== 7 月成交补录(14 行;Σsplit=7;GCI 合计 10,647,800 分)=====
-- Team Brudenell:6 行 ×0.5,$49,753 → 829,220 + 5 × 829,216(余数 4 进首行)
INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000013', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul sale #1 (Team Brudenell)', 0, 829220, '2026-07-02', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #1 (Team Brudenell)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000014', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul sale #2 (Team Brudenell)', 0, 829216, '2026-07-06', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #2 (Team Brudenell)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000015', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul sale #3 (Team Brudenell)', 0, 829216, '2026-07-09', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #3 (Team Brudenell)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000016', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul sale #4 (Team Brudenell)', 0, 829216, '2026-07-14', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #4 (Team Brudenell)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000017', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul sale #5 (Team Brudenell)', 0, 829216, '2026-07-20', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #5 (Team Brudenell)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000018', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul sale #6 (Team Brudenell)', 0, 829216, '2026-07-27', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #6 (Team Brudenell)');

-- Team Cowley:3 行(1.0+0.5+0.5),$26,125 → 870,834 + 2 × 870,833(余数 1 进首行)
INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000019', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul sale #1 (Team Cowley)', 0, 870834, '2026-07-03', 1
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #1 (Team Cowley)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000020', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul sale #2 (Team Cowley)', 0, 870833, '2026-07-10', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #2 (Team Cowley)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000021', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul sale #3 (Team Cowley)', 0, 870833, '2026-07-22', 0.5
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #3 (Team Cowley)');

-- Michael Hatzinicolaou:1 行 ×0.8,$13,700 → 1,370,000
INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000022', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1),
       'Imported Jul sale #1 (Michael Hatzinicolaou)', 0, 1370000, '2026-07-15', 0.8
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #1 (Michael Hatzinicolaou)');

-- Kathy Roberts:4 行 ×0.3,$16,900 → 4 × 422,500(整除)
INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000023', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Kathy Roberts' LIMIT 1),
       'Imported Jul sale #1 (Kathy Roberts)', 0, 422500, '2026-07-04', 0.3
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #1 (Kathy Roberts)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000024', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Kathy Roberts' LIMIT 1),
       'Imported Jul sale #2 (Kathy Roberts)', 0, 422500, '2026-07-11', 0.3
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #2 (Kathy Roberts)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000025', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Kathy Roberts' LIMIT 1),
       'Imported Jul sale #3 (Kathy Roberts)', 0, 422500, '2026-07-18', 0.3
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #3 (Kathy Roberts)');

INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
SELECT 'ad200000-0000-4000-8000-000000000026', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Kathy Roberts' LIMIT 1),
       'Imported Jul sale #4 (Kathy Roberts)', 0, 422500, '2026-07-25', 0.3
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Jul sale #4 (Kathy Roberts)');

-- ===== 8 月房源(11 行,split 全 1,status='sold',$0)=====
-- Chris Joyce:L3
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000001', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Aug listing #1 (Chris Joyce)', 0, '2026-08-03', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #1 (Chris Joyce)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000002', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Aug listing #2 (Chris Joyce)', 0, '2026-08-07', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #2 (Chris Joyce)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000003', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Aug listing #3 (Chris Joyce)', 0, '2026-08-12', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #3 (Chris Joyce)');

-- John Loveluck:L1
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000004', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'John Loveluck' LIMIT 1),
       'Imported Aug listing #1 (John Loveluck)', 0, '2026-08-06', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #1 (John Loveluck)');

-- Team Cowley:L4
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000005', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Aug listing #1 (Team Cowley)', 0, '2026-08-02', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #1 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000006', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Aug listing #2 (Team Cowley)', 0, '2026-08-05', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #2 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000007', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Aug listing #3 (Team Cowley)', 0, '2026-08-10', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #3 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000008', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Aug listing #4 (Team Cowley)', 0, '2026-08-14', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #4 (Team Cowley)');

-- Michael Hatzinicolaou:L1
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000009', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1),
       'Imported Aug listing #1 (Michael Hatzinicolaou)', 0, '2026-08-09', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #1 (Michael Hatzinicolaou)');

-- Hill & Co:L2
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000010', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1),
       'Imported Aug listing #1 (Hill & Co)', 0, '2026-08-04', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #1 (Hill & Co)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000011', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1),
       'Imported Aug listing #2 (Hill & Co)', 0, '2026-08-11', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #2 (Hill & Co)');

-- ===== 7 月房源补录(37 行;Σsplit=35.65;小数份额单独一行)=====
-- Team Cowley:L17.33 → 17×1 + 1×0.33
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000012', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #1 (Team Cowley)', 0, '2026-07-01', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #1 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000013', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #2 (Team Cowley)', 0, '2026-07-02', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #2 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000014', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #3 (Team Cowley)', 0, '2026-07-03', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #3 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000015', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #4 (Team Cowley)', 0, '2026-07-04', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #4 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000016', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #5 (Team Cowley)', 0, '2026-07-05', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #5 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000017', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #6 (Team Cowley)', 0, '2026-07-06', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #6 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000018', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #7 (Team Cowley)', 0, '2026-07-07', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #7 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000019', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #8 (Team Cowley)', 0, '2026-07-08', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #8 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000020', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #9 (Team Cowley)', 0, '2026-07-09', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #9 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000021', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #10 (Team Cowley)', 0, '2026-07-10', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #10 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000022', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #11 (Team Cowley)', 0, '2026-07-11', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #11 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000023', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #12 (Team Cowley)', 0, '2026-07-12', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #12 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000024', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #13 (Team Cowley)', 0, '2026-07-13', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #13 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000025', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #14 (Team Cowley)', 0, '2026-07-14', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #14 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000026', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #15 (Team Cowley)', 0, '2026-07-15', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #15 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000027', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #16 (Team Cowley)', 0, '2026-07-16', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #16 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000028', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #17 (Team Cowley)', 0, '2026-07-17', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #17 (Team Cowley)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000029', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
       'Imported Jul listing #18 (Team Cowley)', 0, '2026-07-18', 'sold', 0.33
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #18 (Team Cowley)');

-- Team Brudenell:L7.66 → 7×1 + 1×0.66
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000030', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul listing #1 (Team Brudenell)', 0, '2026-07-02', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #1 (Team Brudenell)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000031', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul listing #2 (Team Brudenell)', 0, '2026-07-05', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #2 (Team Brudenell)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000032', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul listing #3 (Team Brudenell)', 0, '2026-07-08', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #3 (Team Brudenell)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000033', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul listing #4 (Team Brudenell)', 0, '2026-07-11', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #4 (Team Brudenell)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000034', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul listing #5 (Team Brudenell)', 0, '2026-07-14', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #5 (Team Brudenell)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000035', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul listing #6 (Team Brudenell)', 0, '2026-07-17', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #6 (Team Brudenell)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000036', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul listing #7 (Team Brudenell)', 0, '2026-07-20', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #7 (Team Brudenell)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000037', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1),
       'Imported Jul listing #8 (Team Brudenell)', 0, '2026-07-23', 'sold', 0.66
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #8 (Team Brudenell)');

-- Chris Joyce:L5
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000038', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Jul listing #1 (Chris Joyce)', 0, '2026-07-03', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #1 (Chris Joyce)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000039', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Jul listing #2 (Chris Joyce)', 0, '2026-07-07', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #2 (Chris Joyce)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000040', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Jul listing #3 (Chris Joyce)', 0, '2026-07-12', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #3 (Chris Joyce)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000041', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Jul listing #4 (Chris Joyce)', 0, '2026-07-19', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #4 (Chris Joyce)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000042', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
       'Imported Jul listing #5 (Chris Joyce)', 0, '2026-07-26', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #5 (Chris Joyce)');

-- John Loveluck:L1
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000043', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'John Loveluck' LIMIT 1),
       'Imported Jul listing #1 (John Loveluck)', 0, '2026-07-08', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #1 (John Loveluck)');

-- Michael Hatzinicolaou:L2
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000044', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1),
       'Imported Jul listing #1 (Michael Hatzinicolaou)', 0, '2026-07-09', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #1 (Michael Hatzinicolaou)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000045', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1),
       'Imported Jul listing #2 (Michael Hatzinicolaou)', 0, '2026-07-21', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #2 (Michael Hatzinicolaou)');

-- Kathy Roberts:L1
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000046', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Kathy Roberts' LIMIT 1),
       'Imported Jul listing #1 (Kathy Roberts)', 0, '2026-07-13', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #1 (Kathy Roberts)');

-- Hill & Co:L1.66 → 1×1 + 1×0.66
INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000047', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1),
       'Imported Jul listing #1 (Hill & Co)', 0, '2026-07-05', 'sold', 1
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #1 (Hill & Co)');

INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status, split)
SELECT 'ae300000-0000-4000-8000-000000000048', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1),
       'Imported Jul listing #2 (Hill & Co)', 0, '2026-07-16', 'sold', 0.66
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Jul listing #2 (Hill & Co)');

-- ===== 8 月估价(7 行,单行 count=N,总数 36)=====
INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000001', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1), '2026-08-05', 4
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000001');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000002', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'John Loveluck' LIMIT 1), '2026-08-04', 4
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000002');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000003', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1), '2026-08-07', 8
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000003');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000004', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1), '2026-08-08', 2
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000004');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000005', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1), '2026-08-06', 13
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000005');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000006', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Kathy Roberts' LIMIT 1), '2026-08-09', 1
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000006');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000007', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1), '2026-08-11', 4
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000007');

-- ===== 7 月估价补录(6 行,总数 105;Kathy 0 不建行)=====
INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000008', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1), '2026-07-07', 22
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000008');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000009', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1), '2026-07-08', 17
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000009');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000010', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1), '2026-07-06', 6
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000010');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000011', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'John Loveluck' LIMIT 1), '2026-07-09', 3
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000011');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000012', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1), '2026-07-10', 5
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000012');

INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
SELECT 'af400000-0000-4000-8000-000000000013', (SELECT id FROM orgs LIMIT 1),
       (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1), '2026-07-11', 52
WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000013');
