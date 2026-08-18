'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Select } from '@/components/admin/ui';
import { BUILTIN_ANTHEMS, isBuiltinAnthem } from '@/lib/audio/anthems';
import type { SettingsData, SlideKey } from '@/lib/settings';
import { PERIODS, type Period } from '@/lib/types';

const SLIDE_LABELS: Record<SlideKey, string> = {
  scorecard: 'Sales Scorecard (month to date)',
  scorecard_ytd: 'Sales Scorecard (year to date)',
  leaderboard_sales_count: 'Sales Champions (sales count)',
  leaderboard_gci: 'Top Earners (GCI)',
  leaderboard_listings: 'Listing Legends (new listings)',
  goal_progress: 'Team Goals',
  listings: 'Hot Listings',
  announcements: 'Team News',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const body = (await res.json()) as { data: SettingsData };
      setSettings(body.data);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  function retryLoad() {
    setLoadError(false);
    void loadSettings();
  }

  if (!settings) {
    if (loadError) {
      return (
        <div>
          <p className="mb-3 text-sm text-red-400">Failed to load settings.</p>
          <Button onClick={retryLoad}>Retry</Button>
        </div>
      );
    }
    return <p className="text-muted">Loading…</p>;
  }

  // Capture a non-null alias in this scope: TypeScript's control-flow narrowing
  // of `settings` from the early return above does not persist into the nested
  // function declarations below (updateSlide/moveSlide/save), since those could
  // in principle be invoked independently of this render. `data` is a fresh
  // const whose narrowed (non-null) type is fixed at this point and carries
  // correctly into every closure that captures it.
  const data = settings;

  function update(patch: Partial<SettingsData>) {
    setSettings((cur) => (cur ? { ...cur, ...patch } : cur));
  }

  function updateSlide(index: number, patch: Partial<SettingsData['slides'][number]>) {
    const slides = data.slides.map((s, i) => (i === index ? { ...s, ...patch } : s));
    update({ slides });
  }

  function moveSlide(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= data.slides.length) return;
    const slides = [...data.slides];
    [slides[index], slides[target]] = [slides[target], slides[index]];
    update({ slides });
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save settings' }))) as {
          error?: string;
        };
        setError(body.error ?? 'Failed to save settings');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-heading text-2xl font-bold text-ink">Settings</h1>

      <section className="mb-6 rounded-lg border border-panel-2 bg-panel p-6">
        <h2 className="mb-4 font-heading text-lg font-bold text-ink">Carousel slides</h2>
        <div className="space-y-2">
          {data.slides.map((slide, i) => (
            <div
              key={slide.key}
              className="flex items-center gap-3 rounded border border-panel-2 bg-bg px-3 py-2"
            >
              <input
                type="checkbox"
                checked={slide.enabled}
                onChange={(e) => updateSlide(i, { enabled: e.target.checked })}
                className="h-4 w-4 accent-neon"
              />
              <span className="flex-1 text-sm text-ink">{SLIDE_LABELS[slide.key]}</span>
              <label className="flex items-center gap-1 text-sm text-muted">
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={slide.durationSec}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    updateSlide(i, { durationSec: Number.isNaN(v) ? 5 : v });
                  }}
                  className="w-16 rounded border border-panel-2 bg-panel px-2 py-1 text-ink outline-none focus:border-neon"
                />
                sec
              </label>
              <Button variant="ghost" onClick={() => moveSlide(i, -1)} disabled={i === 0}>
                ↑
              </Button>
              <Button
                variant="ghost"
                onClick={() => moveSlide(i, 1)}
                disabled={i === data.slides.length - 1}
              >
                ↓
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-panel-2 bg-panel p-6 md:grid-cols-2">
        <Field label="Leaderboard period">
          <Select
            value={data.leaderboardPeriod}
            onChange={(e) => update({ leaderboardPeriod: e.target.value as Period })}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Default anthem">
          <Select
            value={data.defaultAnthemUrl ?? ''}
            onChange={(e) => update({ defaultAnthemUrl: e.target.value === '' ? null : e.target.value })}
          >
            <option value="">None</option>
            {BUILTIN_ANTHEMS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {data.defaultAnthemUrl && !isBuiltinAnthem(data.defaultAnthemUrl) && (
              <option value={data.defaultAnthemUrl}>Custom upload</option>
            )}
          </Select>
        </Field>
        <Field label={`Celebration duration: ${data.celebrationDurationSec}s`}>
          <input
            type="range"
            min={10}
            max={30}
            step={1}
            value={data.celebrationDurationSec}
            onChange={(e) => update({ celebrationDurationSec: parseInt(e.target.value, 10) })}
            className="w-full accent-neon"
          />
        </Field>
        <Field label={`Volume: ${Math.round(data.volume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={data.volume}
            onChange={(e) => update({ volume: parseFloat(e.target.value) })}
            className="w-full accent-neon"
          />
        </Field>
      </section>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={saving}>
          Save settings
        </Button>
        {saved && <span className="text-sm text-money">Saved</span>}
      </div>
    </div>
  );
}
