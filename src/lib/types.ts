export const METRICS = ['sales_count', 'gci', 'listings'] as const;
export type Metric = (typeof METRICS)[number];

export const PERIODS = ['week', 'month', 'quarter', 'year'] as const;
export type Period = (typeof PERIODS)[number];

export type LeaderboardEntry = {
  agentId: string;
  name: string;
  photoUrl: string | null;
  value: number;   // sales_count/listings: count; gci: cents
  rank: number;    // 1-based, fully ordered (ties broken deterministically)
};

export type GoalProgress = {
  id: string;
  metric: Metric;
  period: 'month' | 'quarter';
  targetValue: number;
  currentValue: number;
  percent: number; // 0-100, rounded, capped at 100
};

export type TvListing = {
  id: string; address: string; listPriceCents: number;
  photoUrl: string | null; agentName: string;
};

export type TvAnnouncement = { id: string; title: string; body: string | null; imageUrl: string | null };

export type TvScreenInfo = { id: string; name: string };
