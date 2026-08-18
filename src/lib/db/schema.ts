import {
  pgTable, text, integer, bigint, boolean, timestamp, date, jsonb, uniqueIndex, doublePrecision,
} from 'drizzle-orm/pg-core';

export const orgs = pgTable('orgs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // 当天自动生日播报的防重复标记('YYYY-MM-DD');进程重启不重播(设计 §2/§5)
  lastBirthdayBroadcastDate: date('last_birthday_broadcast_date', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_idx').on(t.email)]);

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  photoUrl: text('photo_url'),
  anthemUrl: text('anthem_url'),
  role: text('role').notNull().default('agent'), // 'agent' | 'staff'
  birthday: text('birthday'),                    // 'MM-DD' 或 null
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sales = pgTable('sales', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  address: text('address').notNull(),
  salePriceCents: bigint('sale_price_cents', { mode: 'number' }).notNull(),
  gciCents: bigint('gci_cents', { mode: 'number' }).notNull(),
  saleDate: date('sale_date', { mode: 'string' }).notNull(),
  // 成交拆分份额(设计 §2):0 < split ≤ 1(zod 层校验);共享成交每位参与者各一行,
  // 各自 split 与佣金份额;既有行走 DEFAULT 1(整单)。
  split: doublePrecision('split').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const listings = pgTable('listings', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  address: text('address').notNull(),
  listPriceCents: bigint('list_price_cents', { mode: 'number' }).notNull(),
  photoUrl: text('photo_url'),
  listedDate: date('listed_date', { mode: 'string' }).notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'sold' | 'withdrawn'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appraisals = pgTable('appraisals', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  date: text('date').notNull(),                  // 'YYYY-MM-DD'(API 层 regex 校验,设计 §2)
  count: integer('count').notNull().default(1),  // 一次录入可 +N(≥1,API 层校验)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const screens = pgTable('screens', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull().default('Unnamed TV'),
  deviceTokenHash: text('device_token_hash'),
  pairCode: text('pair_code'),
  pairCodeExpiresAt: timestamp('pair_code_expires_at', { withTimezone: true }),
  status: text('status').notNull().default('pending'), // 'pending' | 'paired'
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('screens_device_token_hash_idx').on(t.deviceTokenHash)]);

export const announcements = pgTable('announcements', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  title: text('title').notNull(),
  body: text('body'),
  imageUrl: text('image_url'),
  enabled: boolean('enabled').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const goals = pgTable('goals', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  metric: text('metric').notNull(), // 'sales_count' | 'gci' | 'listings'
  targetValue: bigint('target_value', { mode: 'number' }).notNull(), // gci 目标为 cents,其余为个数
  period: text('period').notNull(), // 'month' | 'quarter'
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  orgId: text('org_id').primaryKey().references(() => orgs.id),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
