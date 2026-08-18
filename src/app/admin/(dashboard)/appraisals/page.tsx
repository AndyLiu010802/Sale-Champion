'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Select, Table, TextInput } from '@/components/admin/ui';

type AgentRow = { id: string; name: string; active: boolean; role: 'agent' | 'staff' };

type AppraisalRow = {
  id: string;
  agentId: string;
  agentName: string;
  date: string;
  count: number;
};

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyForm() {
  return { agentId: '', date: todayLocal(), count: '1' };
}

export default function AppraisalsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [appraisals, setAppraisals] = useState<AppraisalRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 录入下拉只列 active 的 agent(staff 不做估价,与 sales/listings 同口径)。
  const activeAgents = agents.filter((a) => a.active && a.role === 'agent');

  const load = useCallback(async () => {
    const [agentsRes, appraisalsRes] = await Promise.all([
      fetch('/api/agents'),
      fetch('/api/appraisals'),
    ]);
    if (agentsRes.ok) {
      const body = (await agentsRes.json()) as { data: AgentRow[] };
      setAgents(body.data);
    }
    if (appraisalsRes.ok) {
      const body = (await appraisalsRes.json()) as { data: AppraisalRow[] };
      setAppraisals(body.data);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createAppraisal(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const count = Number.parseInt(form.count, 10);
    if (!Number.isInteger(count) || count < 1 || count > 999) {
      setError('Invalid count');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/appraisals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: form.agentId, date: form.date, count }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save appraisals' }))) as {
          error?: string;
        };
        setError(body.error ?? 'Failed to save appraisals');
        return;
      }
      setForm(emptyForm());
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function deleteAppraisal(id: string) {
    if (!window.confirm('Delete this appraisal entry? The scorecard will recalculate.')) return;
    setError(null);
    const res = await fetch(`/api/appraisals/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
    } else {
      setError('Failed to delete appraisal');
    }
  }

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-ink">Appraisals</h1>

      <form onSubmit={createAppraisal} className="mb-8 rounded-lg border border-panel-2 bg-panel p-6">
        <h2 className="mb-4 font-heading text-lg font-bold text-ink">Record appraisals</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Member">
            <Select
              value={form.agentId}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
              required
            >
              <option value="">Select member…</option>
              {activeAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </Field>
          <Field label="Count">
            <TextInput
              type="number"
              step="1"
              min="1"
              max="999"
              value={form.count}
              onChange={(e) => setForm({ ...form, count: e.target.value })}
              required
            />
          </Field>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-4">
          <Button type="submit" disabled={creating}>
            Save appraisals
          </Button>
        </div>
      </form>

      <h2 className="mb-3 font-heading text-lg font-bold text-ink">Recent appraisals</h2>
      <Table headers={['Date', 'Member', 'Count', 'Actions']}>
        {appraisals.map((a) => (
          <tr key={a.id} className="text-ink">
            <td className="px-3 py-2">{a.date}</td>
            <td className="px-3 py-2">{a.agentName}</td>
            <td className="px-3 py-2">{a.count}</td>
            <td className="px-3 py-2">
              <Button variant="danger" onClick={() => deleteAppraisal(a.id)}>
                Delete
              </Button>
            </td>
          </tr>
        ))}
        {appraisals.length === 0 && (
          <tr>
            <td colSpan={4} className="px-3 py-6 text-center text-muted">
              No appraisals yet — record the first batch above.
            </td>
          </tr>
        )}
      </Table>
    </div>
  );
}
