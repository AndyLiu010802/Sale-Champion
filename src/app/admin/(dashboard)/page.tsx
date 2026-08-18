'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Modal, Select, Table, TextInput } from '@/components/admin/ui';
import { formatMoney } from '@/lib/format';

type AgentRow = { id: string; name: string; active: boolean; role: 'agent' | 'staff' };

type SaleRow = {
  id: string;
  agentId: string;
  agentName: string;
  address: string;
  salePriceCents: number;
  gciCents: number;
  split: number;
  saleDate: string;
};

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toCents(dollars: string): number | null {
  const cents = Math.round(parseFloat(dollars) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/** 拆分份额(设计 §6):0 < split ≤ 1;与 toCents 同款 Number.isFinite 兜底。 */
function parseSplit(value: string): number | null {
  const split = parseFloat(value);
  return Number.isFinite(split) && split > 0 && split <= 1 ? split : null;
}

function emptyForm() {
  return { agentId: '', address: '', salePrice: '', gci: '', split: '1', saleDate: todayLocal() };
}

export default function DashboardPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [replayedId, setReplayedId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Full agent list (active + inactive, agent + staff) — needed so an already-recorded
  // sale for a now-deactivated (or since-demoted-to-staff) agent can still show that
  // agent's name and be edited without reassigning it. Views that let the admin *pick*
  // an agent filter down to active agents (staff never appear — they can't record sales).
  const activeAgents = agents.filter((a) => a.active && a.role === 'agent');
  // If the sale being edited belongs to an agent who is no longer selectable (deactivated
  // or demoted to staff since the sale was recorded), that agent won't be in
  // `activeAgents` — add it back as an extra option so the required <select> still has a
  // valid selected value and native validation doesn't block address/price/date-only edits.
  const editingUnavailableAgent = editing
    ? agents.find((a) => a.id === editing.agentId && !activeAgents.some((x) => x.id === a.id))
    : undefined;

  const load = useCallback(async () => {
    const [agentsRes, salesRes] = await Promise.all([fetch('/api/agents'), fetch('/api/sales')]);
    if (agentsRes.ok) {
      const body = (await agentsRes.json()) as { data: AgentRow[] };
      setAgents(body.data);
    }
    if (salesRes.ok) {
      const body = (await salesRes.json()) as { data: SaleRow[] };
      setSales(body.data);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSale(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const salePriceCents = toCents(form.salePrice);
    const gciCents = toCents(form.gci);
    if (salePriceCents === null || gciCents === null) {
      setError('Invalid amount');
      return;
    }
    const split = parseSplit(form.split);
    if (split === null) {
      setError('Invalid split');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: form.agentId,
          address: form.address,
          salePriceCents,
          gciCents,
          split,
          saleDate: form.saleDate,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save sale' }))) as { error?: string };
        setError(body.error ?? 'Failed to save sale');
        return;
      }
      setForm(emptyForm());
      await load();
    } finally {
      setCreating(false);
    }
  }

  function openEdit(sale: SaleRow) {
    setEditing(sale);
    setError(null);
    setEditForm({
      agentId: sale.agentId,
      address: sale.address,
      salePrice: (sale.salePriceCents / 100).toFixed(2),
      gci: (sale.gciCents / 100).toFixed(2),
      split: String(sale.split),
      saleDate: sale.saleDate,
    });
  }

  function closeEdit() {
    setEditing(null);
    setError(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);

    const salePriceCents = toCents(editForm.salePrice);
    const gciCents = toCents(editForm.gci);
    if (salePriceCents === null || gciCents === null) {
      setError('Invalid amount');
      return;
    }
    const split = parseSplit(editForm.split);
    if (split === null) {
      setError('Invalid split');
      return;
    }

    // Diff-only PATCH: only send fields that actually changed from the original sale.
    // Sending an unchanged agentId would still re-trigger the API's active-agent check,
    // which incorrectly rejects edits (e.g. address-only fixes) once that agent has been
    // deactivated — even though the agent assignment itself isn't changing.
    const patch: Record<string, string | number> = {};
    if (editForm.agentId !== editing.agentId) patch.agentId = editForm.agentId;
    if (editForm.address !== editing.address) patch.address = editForm.address;
    if (salePriceCents !== editing.salePriceCents) patch.salePriceCents = salePriceCents;
    if (gciCents !== editing.gciCents) patch.gciCents = gciCents;
    if (split !== editing.split) patch.split = split;
    if (editForm.saleDate !== editing.saleDate) patch.saleDate = editForm.saleDate;

    if (Object.keys(patch).length === 0) {
      setEditing(null);
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/sales/${editing.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setError('Failed to save changes');
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteSale(id: string) {
    if (!window.confirm('Delete this sale? Leaderboards will recalculate.')) return;
    setError(null);
    const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
    } else {
      setError('Failed to delete sale');
    }
  }

  async function replay(id: string) {
    setError(null);
    setReplayingId(id);
    try {
      const res = await fetch(`/api/sales/${id}/replay`, { method: 'POST' });
      if (res.ok) {
        setReplayedId(id);
        setTimeout(() => setReplayedId((cur) => (cur === id ? null : cur)), 2000);
      } else {
        setError('Failed to replay celebration');
      }
    } finally {
      setReplayingId((cur) => (cur === id ? null : cur));
    }
  }

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-ink">Dashboard</h1>

      <form onSubmit={createSale} className="mb-8 rounded-lg border border-panel-2 bg-panel p-6">
        <h2 className="mb-4 font-heading text-lg font-bold text-ink">Record a sale</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <Field label="Agent">
            <Select
              value={form.agentId}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
              required
            >
              <option value="">Select agent…</option>
              {activeAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Address">
            <TextInput
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="12 Ocean St, Bondi"
              required
            />
          </Field>
          <Field label="Sale price ($)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.salePrice}
              onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
              required
            />
          </Field>
          <Field label="GCI ($)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.gci}
              onChange={(e) => setForm({ ...form, gci: e.target.value })}
              required
            />
          </Field>
          <Field label="Split">
            <TextInput
              type="number"
              step="0.05"
              min="0.05"
              max="1"
              value={form.split}
              onChange={(e) => setForm({ ...form, split: e.target.value })}
              required
            />
          </Field>
          <Field label="Sale date">
            <TextInput
              type="date"
              value={form.saleDate}
              onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
              required
            />
          </Field>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-4">
          <Button type="submit" disabled={creating}>
            Save sale 🎉
          </Button>
        </div>
      </form>

      <h2 className="mb-3 font-heading text-lg font-bold text-ink">Recent sales</h2>
      <Table headers={['Date', 'Agent', 'Address', 'Price', 'GCI', 'Actions']}>
        {sales.map((s) => (
          <tr key={s.id} className="text-ink">
            <td className="px-3 py-2">{s.saleDate}</td>
            <td className="px-3 py-2">{s.agentName}</td>
            <td className="px-3 py-2">{s.address}</td>
            <td className="px-3 py-2 text-money">{formatMoney(s.salePriceCents)}</td>
            <td className="px-3 py-2 text-money">{formatMoney(s.gciCents)}</td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => openEdit(s)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => deleteSale(s.id)}>
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => replay(s.id)}
                  disabled={replayingId === s.id}
                >
                  Replay 🎉
                </Button>
                {replayedId === s.id && <span className="text-sm text-neon">Replayed!</span>}
              </div>
            </td>
          </tr>
        ))}
        {sales.length === 0 && (
          <tr>
            <td colSpan={6} className="px-3 py-6 text-center text-muted">
              No sales yet — record the first one above.
            </td>
          </tr>
        )}
      </Table>

      <Modal open={editing !== null} onClose={closeEdit} title="Edit sale">
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Agent">
            <Select
              value={editForm.agentId}
              onChange={(e) => setEditForm({ ...editForm, agentId: e.target.value })}
              required
            >
              <option value="">Select agent…</option>
              {activeAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              {editingUnavailableAgent && (
                <option value={editingUnavailableAgent.id}>
                  {editingUnavailableAgent.name} (unavailable)
                </option>
              )}
            </Select>
          </Field>
          <Field label="Address">
            <TextInput
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              required
            />
          </Field>
          <Field label="Sale price ($)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={editForm.salePrice}
              onChange={(e) => setEditForm({ ...editForm, salePrice: e.target.value })}
              required
            />
          </Field>
          <Field label="GCI ($)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={editForm.gci}
              onChange={(e) => setEditForm({ ...editForm, gci: e.target.value })}
              required
            />
          </Field>
          <Field label="Split">
            <TextInput
              type="number"
              step="0.05"
              min="0.05"
              max="1"
              value={editForm.split}
              onChange={(e) => setEditForm({ ...editForm, split: e.target.value })}
              required
            />
          </Field>
          <Field label="Sale date">
            <TextInput
              type="date"
              value={editForm.saleDate}
              onChange={(e) => setEditForm({ ...editForm, saleDate: e.target.value })}
              required
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeEdit}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingEdit}>
              Save changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
