'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Field, Modal, Select, Table, TextInput } from '@/components/admin/ui';
import { BUILTIN_ANTHEMS, isBuiltinAnthem } from '@/lib/audio/anthems';

type AgentRow = {
  id: string;
  name: string;
  photoUrl: string | null;
  anthemUrl: string | null;
  active: boolean;
};

const UPLOAD_OPTION = 'upload-custom';

function anthemLabel(anthemUrl: string | null): string {
  if (!anthemUrl) return 'Default';
  const builtin = BUILTIN_ANTHEMS.find((a) => a.id === anthemUrl);
  return builtin ? builtin.name : 'Custom upload';
}

async function uploadFile(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: fd });
  if (!res.ok) return null;
  const body = (await res.json()) as { data: { url: string } };
  return body.data.url;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentRow | null>(null);
  const [name, setName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [anthemUrl, setAnthemUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const anthemFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/agents');
    if (res.ok) {
      const body = (await res.json()) as { data: AgentRow[] };
      setAgents(body.data);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingAgent(null);
    setName('');
    setPhotoUrl('');
    setAnthemUrl('');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(agent: AgentRow) {
    setEditingAgent(agent);
    setName(agent.name);
    setPhotoUrl(agent.photoUrl ?? '');
    setAnthemUrl(agent.anthemUrl ?? '');
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
    const url = await uploadFile(file);
    if (url) setPhotoUrl(url);
    else setError('Photo upload failed');
    e.target.value = '';
  }

  function onAnthemSelect(value: string) {
    if (value === UPLOAD_OPTION) {
      anthemFileRef.current?.click();
      return;
    }
    setAnthemUrl(value);
  }

  async function onAnthemFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    if (url) setAnthemUrl(url);
    else setError('Anthem upload failed');
    e.target.value = '';
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let res: Response;
      if (editingAgent) {
        // Diff-only PATCH: only send fields that actually changed from the agent
        // being edited. Cleared photo/anthem fields are sent as explicit `null`
        // (the API supports clearing that way); untouched fields are omitted so
        // an unrelated field's empty-string state never trips server validation.
        const patch: Record<string, string | null> = {};
        if (name !== editingAgent.name) patch.name = name;
        if (photoUrl !== (editingAgent.photoUrl ?? '')) patch.photoUrl = photoUrl || null;
        if (anthemUrl !== (editingAgent.anthemUrl ?? '')) patch.anthemUrl = anthemUrl || null;
        if (Object.keys(patch).length === 0) {
          setModalOpen(false);
          return;
        }
        res = await fetch(`/api/agents/${editingAgent.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } else {
        res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name,
            ...(photoUrl ? { photoUrl } : {}),
            ...(anthemUrl ? { anthemUrl } : {}),
          }),
        });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save agent' }))) as { error?: string };
        setError(body.error ?? 'Failed to save agent');
        return;
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(agent: AgentRow) {
    setError(null);
    setTogglingId(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !agent.active }),
      });
      if (res.ok) {
        await load();
      } else {
        setError('Failed to update agent status');
      }
    } finally {
      setTogglingId(null);
    }
  }

  const isCustomAnthem = anthemUrl !== '' && !isBuiltinAnthem(anthemUrl);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">Agents</h1>
        <Button onClick={openCreate}>New agent</Button>
      </div>

      <Table headers={['Photo', 'Name', 'Anthem', 'Active', 'Actions']}>
        {agents.map((a) => (
          <tr key={a.id} className="text-ink">
            <td className="px-3 py-2">
              {a.photoUrl ? (
                <img src={a.photoUrl} alt={a.name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-panel-2 text-sm text-muted">
                  {a.name.charAt(0).toUpperCase()}
                </span>
              )}
            </td>
            <td className="px-3 py-2">{a.name}</td>
            <td className="px-3 py-2 text-muted">{anthemLabel(a.anthemUrl)}</td>
            <td className="px-3 py-2">
              <input
                type="checkbox"
                checked={a.active}
                onChange={() => toggleActive(a)}
                disabled={togglingId === a.id}
                className="h-4 w-4 accent-neon disabled:cursor-not-allowed disabled:opacity-50"
              />
            </td>
            <td className="px-3 py-2">
              <Button variant="ghost" onClick={() => openEdit(a)}>
                Edit
              </Button>
            </td>
          </tr>
        ))}
        {agents.length === 0 && (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-muted">
              No agents yet.
            </td>
          </tr>
        )}
      </Table>

      {error && !modalOpen && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <Modal open={modalOpen} onClose={closeModal} title={editingAgent ? 'Edit agent' : 'New agent'}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </Field>
          <Field label="Photo">
            <div className="flex items-center gap-3">
              {photoUrl ? (
                <img src={photoUrl} alt="Agent" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel-2 text-muted">
                  ?
                </span>
              )}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={onPhotoChange}
                className="text-sm text-muted"
              />
            </div>
          </Field>
          <Field label="Anthem">
            <Select value={anthemUrl} onChange={(e) => onAnthemSelect(e.target.value)}>
              <option value="">Default (org anthem)</option>
              {BUILTIN_ANTHEMS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              {isCustomAnthem && <option value={anthemUrl}>Custom upload</option>}
              <option value={UPLOAD_OPTION}>Upload custom…</option>
            </Select>
          </Field>
          <input
            ref={anthemFileRef}
            type="file"
            accept=".mp3,.m4a,.ogg"
            onChange={onAnthemFileChange}
            className="hidden"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {editingAgent ? 'Save changes' : 'Create agent'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
