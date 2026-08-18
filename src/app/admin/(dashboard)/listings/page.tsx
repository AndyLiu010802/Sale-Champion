'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Field, Modal, Select, Table, TextInput } from '@/components/admin/ui';
import { formatMoney } from '@/lib/format';

type AgentRow = { id: string; name: string; active: boolean; role: 'agent' | 'staff' };

type ListingRow = {
  id: string;
  agentId: string;
  agentName: string;
  address: string;
  listPriceCents: number;
  photoUrl: string | null;
  listedDate: string;
  status: string;
};

const STATUS_OPTIONS = ['active', 'sold', 'withdrawn'] as const;

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toCents(dollars: string): number | null {
  const cents = Math.round(parseFloat(dollars) * 100);
  return Number.isFinite(cents) ? cents : null;
}

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: fd });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Upload failed');
  }
  const body = (await res.json()) as { data: { url: string } };
  return body.data.url;
}

function emptyForm() {
  return { agentId: '', address: '', listPrice: '', listedDate: todayLocal(), photoUrl: '' };
}

export default function ListingsPage() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<ListingRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Discard stale upload responses that resolve out of order — same requestSeq
  // pattern used for agent photo/anthem uploads.
  const photoUploadSeq = useRef(0);

  // Full agent list (active + inactive, agent + staff) — needed so a listing already
  // assigned to a now-deactivated (or since-demoted-to-staff) agent can still show that
  // agent's name and be edited without reassigning it. The create/edit picker filters
  // down to active agents only (staff never appear — they can't hold listings).
  const activeAgents = agents.filter((a) => a.active && a.role === 'agent');
  // If the listing being edited belongs to an agent who is no longer selectable
  // (deactivated or demoted to staff since the listing was created), that agent won't be
  // in `activeAgents` — add it back as an extra option so the required <select> still has
  // a valid selected value.
  const editingUnavailableAgent = editingListing
    ? agents.find((a) => a.id === editingListing.agentId && !activeAgents.some((x) => x.id === a.id))
    : undefined;

  const load = useCallback(async () => {
    const [listingsRes, agentsRes] = await Promise.all([fetch('/api/listings'), fetch('/api/agents')]);
    if (listingsRes.ok) {
      const body = (await listingsRes.json()) as { data: ListingRow[] };
      setListings(body.data);
    }
    if (agentsRes.ok) {
      const body = (await agentsRes.json()) as { data: AgentRow[] };
      setAgents(body.data);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingListing(null);
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  }

  function openEdit(l: ListingRow) {
    setEditingListing(l);
    setForm({
      agentId: l.agentId,
      address: l.address,
      listPrice: (l.listPriceCents / 100).toFixed(2),
      listedDate: l.listedDate,
      photoUrl: l.photoUrl ?? '',
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setError(null);
  }

  async function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const seq = ++photoUploadSeq.current;
    setUploadingPhoto(true);
    try {
      const url = await uploadFile(file);
      if (seq !== photoUploadSeq.current) return; // superseded by a newer photo selection
      setForm((f) => ({ ...f, photoUrl: url }));
    } catch (err) {
      if (seq !== photoUploadSeq.current) return;
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      if (seq === photoUploadSeq.current) setUploadingPhoto(false);
      e.target.value = '';
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const listPriceCents = toCents(form.listPrice);
    if (listPriceCents === null) {
      setError('Invalid list price');
      return;
    }
    setSaving(true);
    try {
      let res: Response;
      if (editingListing) {
        // Diff-only PATCH: only send fields that actually changed. Sending an
        // unchanged agentId would still re-trigger the API's active-agent check,
        // which incorrectly rejects edits once that agent has been deactivated.
        const patch: Record<string, string | number | null> = {};
        if (form.agentId !== editingListing.agentId) patch.agentId = form.agentId;
        if (form.address !== editingListing.address) patch.address = form.address;
        if (listPriceCents !== editingListing.listPriceCents) patch.listPriceCents = listPriceCents;
        if (form.listedDate !== editingListing.listedDate) patch.listedDate = form.listedDate;
        if (form.photoUrl !== (editingListing.photoUrl ?? '')) patch.photoUrl = form.photoUrl || null;
        if (Object.keys(patch).length === 0) {
          setModalOpen(false);
          return;
        }
        res = await fetch(`/api/listings/${editingListing.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } else {
        res = await fetch('/api/listings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            agentId: form.agentId,
            address: form.address,
            listPriceCents,
            listedDate: form.listedDate,
            ...(form.photoUrl ? { photoUrl: form.photoUrl } : {}),
          }),
        });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save listing' }))) as { error?: string };
        setError(body.error ?? 'Failed to save listing');
        return;
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, status: string) {
    setError(null);
    setStatusUpdatingId(id);
    try {
      const res = await fetch(`/api/listings/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await load();
      } else {
        setError('Failed to update listing status');
      }
    } finally {
      // Only clear the pending flag if no other status change has started in the
      // meantime — otherwise this stale finally would incorrectly re-enable that
      // other row's select.
      setStatusUpdatingId((cur) => (cur === id ? null : cur));
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this listing?')) return;
    setError(null);
    const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
    } else {
      setError('Failed to delete listing');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">Listings</h1>
        <Button onClick={openCreate}>New listing</Button>
      </div>

      <Table headers={['Photo', 'Address', 'Agent', 'Price', 'Listed', 'Status', 'Actions']}>
        {listings.map((l) => (
          <tr key={l.id} className="text-ink">
            <td className="px-3 py-2">
              {l.photoUrl ? (
                <img src={l.photoUrl} alt={l.address} className="h-10 w-14 rounded object-cover" />
              ) : (
                <span className="flex h-10 w-14 items-center justify-center rounded bg-panel-2 text-xs text-muted">
                  No photo
                </span>
              )}
            </td>
            <td className="px-3 py-2">{l.address}</td>
            <td className="px-3 py-2">{l.agentName}</td>
            <td className="px-3 py-2 text-money">{formatMoney(l.listPriceCents)}</td>
            <td className="px-3 py-2">{l.listedDate}</td>
            <td className="px-3 py-2">
              <div className="w-32">
                <Select
                  value={l.status}
                  onChange={(e) => changeStatus(l.id, e.target.value)}
                  disabled={statusUpdatingId !== null}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </td>
            <td className="px-3 py-2">
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => openEdit(l)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => remove(l.id)}>
                  Delete
                </Button>
              </div>
            </td>
          </tr>
        ))}
        {listings.length === 0 && (
          <tr>
            <td colSpan={7} className="px-3 py-6 text-center text-muted">
              No listings yet.
            </td>
          </tr>
        )}
      </Table>

      {error && !modalOpen && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <Modal open={modalOpen} onClose={closeModal} title={editingListing ? 'Edit listing' : 'New listing'}>
        <form onSubmit={save} className="space-y-4">
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
              {editingUnavailableAgent && (
                <option value={editingUnavailableAgent.id}>
                  {editingUnavailableAgent.name} (unavailable)
                </option>
              )}
            </Select>
          </Field>
          <Field label="Address">
            <TextInput
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              required
            />
          </Field>
          <Field label="List price ($)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.listPrice}
              onChange={(e) => setForm({ ...form, listPrice: e.target.value })}
              required
            />
          </Field>
          <Field label="Listed date">
            <TextInput
              type="date"
              value={form.listedDate}
              onChange={(e) => setForm({ ...form, listedDate: e.target.value })}
              required
            />
          </Field>
          <Field label="Photo">
            <div className="flex items-center gap-3">
              {form.photoUrl ? (
                <img src={form.photoUrl} alt="Listing" className="h-12 w-16 rounded object-cover" />
              ) : (
                <span className="flex h-12 w-16 items-center justify-center rounded bg-panel-2 text-xs text-muted">
                  No photo
                </span>
              )}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={onPhotoChange}
                disabled={uploadingPhoto}
                className="text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
              />
              {uploadingPhoto && <span className="text-sm text-muted">Uploading…</span>}
            </div>
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploadingPhoto}>
              {editingListing ? 'Save changes' : 'Create listing'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
