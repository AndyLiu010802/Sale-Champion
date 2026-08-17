'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Table, TextInput } from '@/components/admin/ui';

type ScreenRow = {
  id: string;
  name: string;
  status: string;
  online: boolean;
  lastSeenAt: string | null;
};

export default function ScreensPage() {
  const [screens, setScreens] = useState<ScreenRow[]>([]);
  const [pairCode, setPairCode] = useState('');
  const [pairName, setPairName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  // Serializes Rename/Unpair across all rows — same togglingId/statusUpdatingId
  // pattern used on the agents/listings/announcements pages, so a rename and an
  // unpair on the same (or a different) row can't race each other mid-flight.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/screens');
    if (res.ok) {
      const body = (await res.json()) as { data: ScreenRow[] };
      setScreens(body.data);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function pair(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPairing(true);
    try {
      const res = await fetch('/api/screens/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pairCode: pairCode.trim(), name: pairName.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Pairing failed' }))) as { error?: string };
        setError(body.error ?? 'Pairing failed');
        return;
      }
      setPairCode('');
      setPairName('');
      await load();
    } finally {
      setPairing(false);
    }
  }

  async function rename(screen: ScreenRow) {
    const name = window.prompt('New name for this TV', screen.name);
    if (!name || name.trim() === '') return;
    setError(null);
    setBusyId(screen.id);
    try {
      const res = await fetch(`/api/screens/${screen.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        await load();
      } else {
        setError('Failed to rename screen');
      }
    } finally {
      // Only clear the pending flag if no other row action has started in the
      // meantime — otherwise this stale finally would incorrectly re-enable
      // buttons for an action that's still in flight.
      setBusyId((cur) => (cur === screen.id ? null : cur));
    }
  }

  async function unpair(screen: ScreenRow) {
    if (!window.confirm(`Unpair "${screen.name}"? The TV will return to the pairing screen.`)) return;
    setError(null);
    setBusyId(screen.id);
    try {
      const res = await fetch(`/api/screens/${screen.id}`, { method: 'DELETE' });
      if (res.ok) {
        await load();
      } else {
        setError('Failed to unpair screen');
      }
    } finally {
      setBusyId((cur) => (cur === screen.id ? null : cur));
    }
  }

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-ink">Screens</h1>

      <form onSubmit={pair} className="mb-8 rounded-lg border border-panel-2 bg-panel p-6">
        <h2 className="mb-4 font-heading text-lg font-bold text-ink">Pair a TV</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Pairing code (shown on the TV)">
            <TextInput
              value={pairCode}
              onChange={(e) => setPairCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              required
            />
          </Field>
          <Field label="TV name">
            <TextInput
              value={pairName}
              onChange={(e) => setPairName(e.target.value)}
              placeholder="Front office TV"
              required
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={pairing}>
              Pair TV
            </Button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </form>

      <Table headers={['Name', 'Status', 'Online', 'Last seen', 'Actions']}>
        {screens.map((s) => (
          <tr key={s.id} className="text-ink">
            <td className="px-3 py-2">{s.name}</td>
            <td className="px-3 py-2">
              <span className={s.status === 'paired' ? 'text-neon' : 'text-muted'}>{s.status}</span>
            </td>
            <td className="px-3 py-2">
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${s.online ? 'bg-money' : 'bg-muted/40'}`}
                />
                <span className={s.online ? 'text-money' : 'text-muted'}>
                  {s.online ? 'Online' : 'Offline'}
                </span>
              </span>
            </td>
            <td className="px-3 py-2 text-muted">
              {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : '—'}
            </td>
            <td className="px-3 py-2">
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => rename(s)} disabled={busyId !== null}>
                  Rename
                </Button>
                <Button variant="danger" onClick={() => unpair(s)} disabled={busyId !== null}>
                  Unpair
                </Button>
              </div>
            </td>
          </tr>
        ))}
        {screens.length === 0 && (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-muted">
              No screens yet — open /tv on the TV browser to get a pairing code.
            </td>
          </tr>
        )}
      </Table>
    </div>
  );
}
