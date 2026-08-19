import { z } from 'zod';
import type { TvScreenInfo } from '../types';

export type SaleCelebration = {
  kind: 'sale';
  saleId: string;
  agentName: string;
  agentPhotoUrl: string | null;
  address: string;
  salePriceCents: number;
  anthemUrl: string | null;   // 已解析:agent.anthemUrl ?? settings.defaultAnthemUrl(可能为 builtin:xxx 或文件 URL)
  durationSec: number;
  // 团队成交(团队设计 §4):该队的 active 成员,按 name 排序,TV 端并排显示照片。
  // 个人成交与零成员团队一律省略此字段(TV 端回落单张头像)。
  members?: { name: string; photoUrl: string | null }[];
};

export type BirthdayCelebration = {
  kind: 'birthday';
  agentId: string;
  name: string;
  photoUrl: string | null;
  durationSec: number;
};

export type CelebrationPayload = SaleCelebration | BirthdayCelebration;

export type DataDomain = 'sales' | 'listings' | 'goals' | 'announcements' | 'agents' | 'appraisals';

export type ServerEvent =
  | { type: 'paired'; deviceToken: string; screen: TvScreenInfo }
  | { type: 'celebration.play'; celebration: CelebrationPayload }
  | { type: 'data.updated'; domain: DataDomain }
  | { type: 'config.updated' }
  | { type: 'screen.updated'; screen: TvScreenInfo }
  | { type: 'screen.unpaired' }
  | { type: 'pong' };

export const clientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    deviceToken: z.string().optional(),
    screenId: z.string().optional(),
    pairCode: z.string().optional(),
  }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientEvent = z.infer<typeof clientEventSchema>;
