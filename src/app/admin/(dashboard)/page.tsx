'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Modal, Select, Table, TextInput } from '@/components/admin/ui';
import { formatMoney } from '@/lib/format';

type AgentRow = { id: string; name: string; active: boolean };

type SaleRow = {
  id: string;
  agentId: string;
  agentName: string;
  address: string;
  salePriceCents: number;
  gciCents: number;
  saleDate: string;
};

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toCents(dollars: string): number {
  return Math.round(parseFloat(dollars) * 100);
}

function emptyForm() {
  return { agentId: '', address: '', salePrice: '', gci: '', saleDate: todayLocal() };
}

export default function DashboardPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [replayedId, setReplayedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [agentsRes, salesRes] = await Promise.all([fetch('/api/agents'), fetch('/api/sales')]);
    if (agentsRes.ok) {
      const body = (await agentsRes.json()) as { data: AgentRow[] };
      setAgents(body.data.filter((a) => a.active));
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
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: form.agentId,
        address: form.address,
        salePriceCents: toCents(form.salePrice),
        gciCents: toCents(form.gci),
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
  }

  function openEdit(sale: SaleRow) {
    setEditing(sale);
    setEditForm({
      agentId: sale.agentId,
      address: sale.address,
      salePrice: (sale.salePriceCents / 100).toFixed(2),
      gci: (sale.gciCents / 100).toFixed(2),
      saleDate: sale.saleDate,
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;

    // Diff-only PATCH: only send fields that actually changed from the original sale.
    // Sending an unchanged agentId would still re-trigger the API's active-agent check,
    // which incorrectly rejects edits (e.g. address-only fixes) once that agent has been
    // deactivated — even though the agent assignment itself isn't changing.
    const patch: Record<string, string | number> = {};
    if (editForm.agentId !== editing.agentId) patch.agentId = editForm.agentId;
    if (editForm.address !== editing.address) patch.address = editForm.address;
    const salePriceCents = toCents(editForm.salePrice);
    if (salePriceCents !== editing.salePriceCents) patch.salePriceCents = salePriceCents;
    const gciCents = toCents(editForm.gci);
    if (gciCents !== editing.gciCents) patch.gciCents = gciCents;
    if (editForm.saleDate !== editing.saleDate) patch.saleDate = editForm.saleDate;

    if (Object.keys(patch).length === 0) {
      setEditing(null);
      return;
    }

    const res = await fetch(`/api/sales/${editing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setEditing(null);
      await load();
    }
  }

  async function deleteSale(id: string) {
    if (!window.confirm('Delete this sale? Leaderboards will recalculate.')) return;
    const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  async function replay(id: string) {
    const res = await fetch(`/api/sales/${id}/replay`, { method: 'POST' });
    if (res.ok) {
      setReplayedId(id);
      setTimeout(() => setReplayedId((cur) => (cur === id ? null : cur)), 2000);
    }
  }

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-ink">Dashboard</h1>

      <form onSubmit={createSale} className="mb-8 rounded-lg border border-panel-2 bg-panel p-6">
        <h2 className="mb-4 font-heading text-lg font-bold text-ink">Record a sale</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <Field label="Agent">
            <Select
              value={form.agentId}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
              required
            >
              <option value="">Select agent…</option>
              {agents.map((a) => (
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
          <Button type="submit">Save sale 🎉</Button>
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
                <Button variant="ghost" onClick={() => replay(s.id)}>
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

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit sale">
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Agent">
            <Select
              value={editForm.agentId}
              onChange={(e) => setEditForm({ ...editForm, agentId: e.target.value })}
              required
            >
              <option value="">Select agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
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
          <Field label="Sale date">
            <TextInput
              type="date"
              value={editForm.saleDate}
              onChange={(e) => setEditForm({ ...editForm, saleDate: e.target.value })}
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
