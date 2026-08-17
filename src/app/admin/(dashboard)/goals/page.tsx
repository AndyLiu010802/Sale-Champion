'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Modal, Select, Table, TextInput } from '@/components/admin/ui';
import { formatValue } from '@/lib/format';
import { METRICS, type Metric } from '@/lib/types';

type GoalRow = {
  id: string;
  metric: Metric;
  targetValue: number;
  period: 'month' | 'quarter';
  active: boolean;
};

const METRIC_LABELS: Record<Metric, string> = {
  sales_count: 'Sales count',
  gci: 'GCI',
  listings: 'New listings',
};

// Returns null (rather than throwing) so the caller can render a single
// validation message the same way the money-input helpers on the other admin
// pages do — mirrors toCents' Number.isFinite guard, plus the positivity
// check the goals API itself enforces (targetValue must be > 0).
function toTargetValue(metric: Metric, raw: string): number | null {
  const n = metric === 'gci' ? Math.round(parseFloat(raw) * 100) : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function emptyForm(): { metric: Metric; period: 'month' | 'quarter'; target: string } {
  return { metric: 'sales_count', period: 'month', target: '' };
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/goals');
    if (res.ok) {
      const body = (await res.json()) as { data: GoalRow[] };
      setGoals(body.data);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingGoal(null);
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  }

  function openEdit(g: GoalRow) {
    setEditingGoal(g);
    setForm({
      metric: g.metric,
      period: g.period,
      target: g.metric === 'gci' ? (g.targetValue / 100).toFixed(2) : String(g.targetValue),
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setError(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const targetValue = toTargetValue(form.metric, form.target);
    if (targetValue === null) {
      setError('Target must be a positive number');
      return;
    }
    setSaving(true);
    try {
      let res: Response;
      if (editingGoal) {
        // Diff-only PATCH: only send fields that actually changed.
        const patch: Record<string, string | number> = {};
        if (form.metric !== editingGoal.metric) patch.metric = form.metric;
        if (form.period !== editingGoal.period) patch.period = form.period;
        if (targetValue !== editingGoal.targetValue) patch.targetValue = targetValue;
        if (Object.keys(patch).length === 0) {
          setModalOpen(false);
          return;
        }
        res = await fetch(`/api/goals/${editingGoal.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } else {
        res = await fetch('/api/goals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ metric: form.metric, targetValue, period: form.period }),
        });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save goal' }))) as { error?: string };
        setError(body.error ?? 'Failed to save goal');
        return;
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(g: GoalRow) {
    setError(null);
    setTogglingId(g.id);
    try {
      const res = await fetch(`/api/goals/${g.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !g.active }),
      });
      if (res.ok) {
        await load();
      } else {
        setError('Failed to update goal');
      }
    } finally {
      // Only clear the pending flag if no other toggle has started in the meantime
      // — otherwise this stale finally would incorrectly re-enable that other row.
      setTogglingId((cur) => (cur === g.id ? null : cur));
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this goal?')) return;
    setError(null);
    const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
    } else {
      setError('Failed to delete goal');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">Goals</h1>
        <Button onClick={openCreate}>New goal</Button>
      </div>

      <Table headers={['Metric', 'Period', 'Target', 'Active', 'Actions']}>
        {goals.map((g) => (
          <tr key={g.id} className="text-ink">
            <td className="px-3 py-2">{METRIC_LABELS[g.metric]}</td>
            <td className="px-3 py-2 text-muted">{g.period}</td>
            <td className="px-3 py-2 text-money">{formatValue(g.metric, g.targetValue)}</td>
            <td className="px-3 py-2">
              <input
                type="checkbox"
                checked={g.active}
                onChange={() => toggleActive(g)}
                disabled={togglingId !== null}
                className="h-4 w-4 accent-neon disabled:cursor-not-allowed disabled:opacity-50"
              />
            </td>
            <td className="px-3 py-2">
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => openEdit(g)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => remove(g.id)}>
                  Delete
                </Button>
              </div>
            </td>
          </tr>
        ))}
        {goals.length === 0 && (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-muted">
              No goals yet.
            </td>
          </tr>
        )}
      </Table>

      {error && !modalOpen && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <Modal open={modalOpen} onClose={closeModal} title={editingGoal ? 'Edit goal' : 'New goal'}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Metric">
            <Select
              value={form.metric}
              onChange={(e) => setForm({ ...form, metric: e.target.value as Metric })}
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Period">
            <Select
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value as 'month' | 'quarter' })}
            >
              <option value="month">month</option>
              <option value="quarter">quarter</option>
            </Select>
          </Field>
          <Field label={form.metric === 'gci' ? 'Target GCI ($)' : 'Target count'}>
            <TextInput
              type="number"
              step={form.metric === 'gci' ? '0.01' : '1'}
              min="0"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              required
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {editingGoal ? 'Save changes' : 'Create goal'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
