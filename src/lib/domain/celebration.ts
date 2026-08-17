import type { SaleCelebration, BirthdayCelebration } from '../ws/protocol';
import type { SettingsData } from '../settings';

export function buildCelebrationPayload(
  sale: { id: string; address: string; salePriceCents: number },
  agent: { name: string; photoUrl: string | null; anthemUrl: string | null },
  settings: SettingsData,
): SaleCelebration {
  return {
    kind: 'sale',
    saleId: sale.id,
    agentName: agent.name,
    agentPhotoUrl: agent.photoUrl,
    address: sale.address,
    salePriceCents: sale.salePriceCents,
    anthemUrl: agent.anthemUrl || settings.defaultAnthemUrl,
    durationSec: settings.celebrationDurationSec,
  };
}

export function buildBirthdayPayload(
  agent: { id: string; name: string; photoUrl: string | null },
  settings: SettingsData,
): BirthdayCelebration {
  return {
    kind: 'birthday',
    agentId: agent.id,
    name: agent.name,
    photoUrl: agent.photoUrl,
    // Floor at 13s so the ~12.7s birthday melody never gets cut mid-phrase.
    durationSec: Math.max(13, settings.celebrationDurationSec),
  };
}
