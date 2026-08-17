'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Field, Modal, Table, TextInput } from '@/components/admin/ui';

type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  enabled: boolean;
  sortOrder: number;
};

function toSortOrder(value: string): number {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
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

function emptyForm(sortOrder = '0') {
  return { title: '', body: '', imageUrl: '', sortOrder };
}

export default function AnnouncementsPage() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementRow | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Discard stale upload responses that resolve out of order — same requestSeq
  // pattern used for agent photo/anthem uploads.
  const imageUploadSeq = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch('/api/announcements');
    if (res.ok) {
      const body = (await res.json()) as { data: AnnouncementRow[] };
      setRows(body.data);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingAnnouncement(null);
    setForm(emptyForm(String(rows.length)));
    setError(null);
    setModalOpen(true);
  }

  function openEdit(a: AnnouncementRow) {
    setEditingAnnouncement(a);
    setForm({
      title: a.title,
      body: a.body ?? '',
      imageUrl: a.imageUrl ?? '',
      sortOrder: String(a.sortOrder),
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setError(null);
  }

  async function onImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const seq = ++imageUploadSeq.current;
    setUploadingImage(true);
    try {
      const url = await uploadFile(file);
      if (seq !== imageUploadSeq.current) return; // superseded by a newer image selection
      setForm((f) => ({ ...f, imageUrl: url }));
    } catch (err) {
      if (seq !== imageUploadSeq.current) return;
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      if (seq === imageUploadSeq.current) setUploadingImage(false);
      e.target.value = '';
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const sortOrder = toSortOrder(form.sortOrder);
    setSaving(true);
    try {
      let res: Response;
      if (editingAnnouncement) {
        // Diff-only PATCH: only send fields that actually changed.
        const patch: Record<string, string | number | null> = {};
        if (form.title !== editingAnnouncement.title) patch.title = form.title;
        if (form.body !== (editingAnnouncement.body ?? '')) patch.body = form.body || null;
        if (form.imageUrl !== (editingAnnouncement.imageUrl ?? '')) patch.imageUrl = form.imageUrl || null;
        if (sortOrder !== editingAnnouncement.sortOrder) patch.sortOrder = sortOrder;
        if (Object.keys(patch).length === 0) {
          setModalOpen(false);
          return;
        }
        res = await fetch(`/api/announcements/${editingAnnouncement.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } else {
        res = await fetch('/api/announcements', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            ...(form.body ? { body: form.body } : {}),
            ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
            sortOrder,
          }),
        });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save announcement' }))) as {
          error?: string;
        };
        setError(body.error ?? 'Failed to save announcement');
        return;
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(a: AnnouncementRow) {
    setError(null);
    setTogglingId(a.id);
    try {
      const res = await fetch(`/api/announcements/${a.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      if (res.ok) {
        await load();
      } else {
        setError('Failed to update announcement');
      }
    } finally {
      // Only clear the pending flag if no other toggle has started in the meantime
      // — otherwise this stale finally would incorrectly re-enable that other row.
      setTogglingId((cur) => (cur === a.id ? null : cur));
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this announcement?')) return;
    setError(null);
    const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
    } else {
      setError('Failed to delete announcement');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">Announcements</h1>
        <Button onClick={openCreate}>New announcement</Button>
      </div>

      <Table headers={['Title', 'Order', 'Enabled', 'Actions']}>
        {rows.map((a) => (
          <tr key={a.id} className="text-ink">
            <td className="px-3 py-2">{a.title}</td>
            <td className="px-3 py-2 text-muted">{a.sortOrder}</td>
            <td className="px-3 py-2">
              <input
                type="checkbox"
                checked={a.enabled}
                onChange={() => toggleEnabled(a)}
                disabled={togglingId !== null}
                className="h-4 w-4 accent-neon disabled:cursor-not-allowed disabled:opacity-50"
              />
            </td>
            <td className="px-3 py-2">
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => openEdit(a)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => remove(a.id)}>
                  Delete
                </Button>
              </div>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={4} className="px-3 py-6 text-center text-muted">
              No announcements yet.
            </td>
          </tr>
        )}
      </Table>

      {error && !modalOpen && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingAnnouncement ? 'Edit announcement' : 'New announcement'}
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Title">
            <TextInput
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              autoFocus
            />
          </Field>
          <Field label="Body (optional)">
            <TextInput value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>
          <Field label="Image (optional)">
            <div className="flex items-center gap-3">
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="Announcement" className="h-12 w-16 rounded object-cover" />
              ) : (
                <span className="flex h-12 w-16 items-center justify-center rounded bg-panel-2 text-xs text-muted">
                  No image
                </span>
              )}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={onImageChange}
                disabled={uploadingImage}
                className="text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
              />
              {uploadingImage && <span className="text-sm text-muted">Uploading…</span>}
            </div>
          </Field>
          <Field label="Sort order">
            <TextInput
              type="number"
              step="1"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              required
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploadingImage}>
              {editingAnnouncement ? 'Save changes' : 'Create announcement'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
