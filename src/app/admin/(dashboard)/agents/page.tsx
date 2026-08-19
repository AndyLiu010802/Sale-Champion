'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Field, Modal, Select, Table, TextInput } from '@/components/admin/ui';
import { BUILTIN_ANTHEMS, isBuiltinAnthem } from '@/lib/audio/anthems';

type AgentRow = {
  id: string;
  name: string;
  photoUrl: string | null;
  anthemUrl: string | null;
  role: AgentType;
  birthday: string | null;
  teamId: string | null;
  active: boolean;
};

// 团队设计 §5:Type 下拉三选一;team 行可挂若干 role='agent' 成员。
type AgentType = 'agent' | 'staff' | 'team';

const UPLOAD_OPTION = 'upload-custom';

// Birthday dropdown options — zero-padded to match the server's 'MM-DD' format.
// Day range is a flat 01-31 (no per-month clamping); the server's BIRTHDAY_RE is
// equally permissive by design, so e.g. 02-31 is selectable and accepted.
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

function anthemLabel(anthemUrl: string | null): string {
  if (!anthemUrl) return 'Default';
  const builtin = BUILTIN_ANTHEMS.find((a) => a.id === anthemUrl);
  return builtin ? builtin.name : 'Custom upload';
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
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [role, setRole] = useState<AgentType>('agent');
  // 编辑中的团队成员全量名单(勾选即改隶属),提交时整份发给服务端 diff。
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [birthdayMonth, setBirthdayMonth] = useState('');
  const [birthdayDay, setBirthdayDay] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingAnthem, setUploadingAnthem] = useState(false);
  const anthemFileRef = useRef<HTMLInputElement>(null);
  // Discard stale upload responses that resolve out of order (e.g. a slow upload
  // from an earlier file selection landing after a newer selection already
  // completed) — same requestSeq pattern as TvApp's refreshState.
  const photoUploadSeq = useRef(0);
  const anthemUploadSeq = useRef(0);

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
    setRole('agent');
    setMemberIds([]);
    setBirthdayMonth('');
    setBirthdayDay('');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(agent: AgentRow) {
    setEditingAgent(agent);
    setName(agent.name);
    setPhotoUrl(agent.photoUrl ?? '');
    setAnthemUrl(agent.anthemUrl ?? '');
    setRole(agent.role);
    setMemberIds(agents.filter((a) => a.teamId === agent.id).map((a) => a.id));
    const [bm, bd] = agent.birthday ? agent.birthday.split('-') : ['', ''];
    setBirthdayMonth(bm ?? '');
    setBirthdayDay(bd ?? '');
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
      setPhotoUrl(url);
    } catch (err) {
      if (seq !== photoUploadSeq.current) return;
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      if (seq === photoUploadSeq.current) setUploadingPhoto(false);
      e.target.value = '';
    }
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
    setError(null);
    const seq = ++anthemUploadSeq.current;
    setUploadingAnthem(true);
    try {
      const url = await uploadFile(file);
      if (seq !== anthemUploadSeq.current) return; // superseded by a newer anthem selection
      setAnthemUrl(url);
    } catch (err) {
      if (seq !== anthemUploadSeq.current) return;
      setError(err instanceof Error ? err.message : 'Anthem upload failed');
    } finally {
      if (seq === anthemUploadSeq.current) setUploadingAnthem(false);
      e.target.value = '';
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Both dropdowns picked → 'MM-DD'; either left on '—' → null (cleared).
      const birthday = birthdayMonth && birthdayDay ? `${birthdayMonth}-${birthdayDay}` : null;
      let res: Response;
      if (editingAgent) {
        // Diff-only PATCH: only send fields that actually changed from the agent
        // being edited. Cleared photo/anthem/birthday fields are sent as explicit
        // `null` (the API supports clearing that way); untouched fields are omitted
        // so an unrelated field's empty-string state never trips server validation.
        const patch: Record<string, string | string[] | null> = {};
        if (name !== editingAgent.name) patch.name = name;
        if (photoUrl !== (editingAgent.photoUrl ?? '')) patch.photoUrl = photoUrl || null;
        // Staff have no anthem field in the UI — never send anthemUrl for a staff row,
        // so it's neither set nor cleared and the underlying data (if any) is preserved.
        if (role !== 'staff') {
          if (anthemUrl !== (editingAgent.anthemUrl ?? '')) patch.anthemUrl = anthemUrl || null;
        }
        if (role !== editingAgent.role) patch.role = role;
        // Team 行没有生日字段,连清空都不发——服务端会在转为 team 时自行置 null。
        if (role !== 'team' && birthday !== editingAgent.birthday) patch.birthday = birthday;
        if (role === 'team') {
          const before = [...originalMemberIds(editingAgent.id)].sort().join(',');
          if ([...memberIds].sort().join(',') !== before) patch.memberIds = memberIds;
        } else if (editingAgent.role === 'team') {
          // 从 Team 改走:成员保留、仅脱队(与删除同语义),否则服务端 400。
          patch.memberIds = [];
        }
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
            role,
            ...(photoUrl ? { photoUrl } : {}),
            ...(role !== 'staff' && anthemUrl ? { anthemUrl } : {}),
            ...(role !== 'team' && birthday ? { birthday } : {}),
            ...(role === 'team' ? { memberIds } : {}),
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
      // Only clear the pending flag if no other toggle has started in the meantime
      // (e.g. the admin toggled a different agent while this request was in flight) —
      // otherwise this stale finally would incorrectly re-enable that other row.
      setTogglingId((cur) => (cur === agent.id ? null : cur));
    }
  }

  async function broadcastBirthday(agent: AgentRow) {
    setError(null);
    setBroadcastingId(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}/birthday-broadcast`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: 'Failed to play birthday broadcast' }))) as { error?: string };
        setError(body.error ?? 'Failed to play birthday broadcast');
      }
    } finally {
      // Only clear the pending flag if no other broadcast has started in the
      // meantime — same stale-finally guard as toggleActive.
      setBroadcastingId((cur) => (cur === agent.id ? null : cur));
    }
  }

  async function deleteAgent(agent: AgentRow) {
    setError(null);
    setDeletingId(agent.id);
    try {
      // 先取该成员名下记录计数,让确认弹窗给出具体数字(清理设计 §2.1)。
      const usageRes = await fetch(`/api/agents/${agent.id}/usage`);
      if (!usageRes.ok) {
        const body = (await usageRes
          .json()
          .catch(() => ({ error: 'Failed to load member records' }))) as { error?: string };
        setError(body.error ?? 'Failed to load member records');
        return;
      }
      const { data: usage } = (await usageRes.json()) as {
        data: { sales: number; listings: number; appraisals: number };
      };
      const confirmed = window.confirm(
        `Delete "${agent.name}"? This permanently removes ${usage.sales} sales, ` +
          `${usage.listings} listings and ${usage.appraisals} appraisals. This cannot be undone.`,
      );
      if (!confirmed) return;
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: 'Failed to delete member' }))) as { error?: string };
        setError(body.error ?? 'Failed to delete member');
        return;
      }
      await load();
    } finally {
      // Only clear the pending flag if no other delete has started in the
      // meantime — same stale-finally guard as toggleActive.
      setDeletingId((cur) => (cur === agent.id ? null : cur));
    }
  }

  const isCustomAnthem = anthemUrl !== '' && !isBuiltinAnthem(anthemUrl);
  const teamNameById = new Map(agents.filter((a) => a.role === 'team').map((a) => [a.id, a.name]));
  /** 当前挂在某队名下的成员 id(顺序与 memberIds 一致,便于 diff 比对)。 */
  const originalMemberIds = (teamId: string) =>
    agents.filter((a) => a.teamId === teamId).map((a) => a.id);
  // 可勾选的成员:全部 active 的 agent 行(含已属其他队的——勾选即改隶属)。
  const memberCandidates = agents.filter((a) => a.role === 'agent' && a.active);

  function toggleMember(id: string) {
    setMemberIds((cur) => (cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">Team</h1>
        <Button onClick={openCreate}>New agent</Button>
      </div>

      <Table headers={['Photo', 'Name', 'Type', 'Birthday', 'Anthem', 'Active', 'Actions']}>
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
            <td className="px-3 py-2">
              {a.name}
              {a.teamId && (
                <span className="ml-2 text-xs text-muted">· {teamNameById.get(a.teamId) ?? 'Team'}</span>
              )}
            </td>
            <td className="px-3 py-2">
              {a.role === 'staff' ? (
                <span className="rounded bg-panel-2 px-2 py-0.5 text-xs font-medium text-muted">
                  Staff
                </span>
              ) : a.role === 'team' ? (
                <span className="rounded bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
                  Team
                </span>
              ) : (
                <span className="rounded bg-neon/10 px-2 py-0.5 text-xs font-medium text-neon">
                  Agent
                </span>
              )}
            </td>
            <td className="px-3 py-2 text-muted">{a.birthday ?? '—'}</td>
            <td className="px-3 py-2 text-muted">{anthemLabel(a.anthemUrl)}</td>
            <td className="px-3 py-2">
              <input
                type="checkbox"
                checked={a.active}
                onChange={() => toggleActive(a)}
                disabled={togglingId !== null}
                className="h-4 w-4 accent-neon disabled:cursor-not-allowed disabled:opacity-50"
              />
            </td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => openEdit(a)}>
                  Edit
                </Button>
                {a.role !== 'team' && (
                  <Button
                    variant="ghost"
                    aria-label="Play birthday broadcast"
                    onClick={() => broadcastBirthday(a)}
                    disabled={broadcastingId !== null}
                  >
                    🎂
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => deleteAgent(a)}
                  disabled={deletingId !== null}
                >
                  Delete
                </Button>
              </div>
            </td>
          </tr>
        ))}
        {agents.length === 0 && (
          <tr>
            <td colSpan={7} className="px-3 py-6 text-center text-muted">
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
          <Field label="Type">
            <Select value={role} onChange={(e) => setRole(e.target.value as AgentType)}>
              <option value="agent">Agent</option>
              <option value="staff">Staff</option>
              <option value="team">Team</option>
            </Select>
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
                disabled={uploadingPhoto}
                className="text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
              />
              {uploadingPhoto && <span className="text-sm text-muted">Uploading…</span>}
            </div>
          </Field>
          {role !== 'team' && (
            <Field label="Birthday">
              <div className="flex gap-2">
                <Select
                  aria-label="Birthday month"
                  value={birthdayMonth}
                  onChange={(e) => setBirthdayMonth(e.target.value)}
                >
                  <option value="">—</option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Birthday day"
                  value={birthdayDay}
                  onChange={(e) => setBirthdayDay(e.target.value)}
                >
                  <option value="">—</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          )}
          {role === 'team' && (
            <Field label="Members">
              <div className="max-h-52 space-y-1 overflow-y-auto rounded border border-panel-2 bg-bg p-2">
                {memberCandidates.length === 0 && (
                  <p className="text-sm text-muted">No active agents to add yet.</p>
                )}
                {memberCandidates.map((a) => {
                  // 已属别队的成员也列出:勾选即改隶属,旁注写明它现在在哪队。
                  const otherTeam =
                    a.teamId && a.teamId !== editingAgent?.id ? teamNameById.get(a.teamId) : null;
                  return (
                    <label key={a.id} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={memberIds.includes(a.id)}
                        onChange={() => toggleMember(a.id)}
                        className="h-4 w-4 accent-neon"
                      />
                      <span>{a.name}</span>
                      {otherTeam && <span className="text-xs text-muted">· {otherTeam}</span>}
                    </label>
                  );
                })}
              </div>
            </Field>
          )}
          {role !== 'staff' && (
            <>
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
                disabled={uploadingAnthem}
                className="hidden"
              />
              {uploadingAnthem && <p className="text-sm text-muted">Uploading anthem…</p>}
            </>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploadingPhoto || uploadingAnthem}>
              {editingAgent ? 'Save changes' : 'Create agent'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
