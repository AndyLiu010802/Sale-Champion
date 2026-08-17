import type { CelebrationPayload } from '../ws/protocol';
import type { SettingsData } from '../settings';

export function buildCelebrationPayload(
  sale: { id: string; address: string; salePriceCents: number },
  agent: { name: string; photoUrl: string | null; anthemUrl: string | null },
  settings: SettingsData,
): CelebrationPayload {
  return {
    saleId: sale.id,
    agentName: agent.name,
    agentPhotoUrl: agent.photoUrl,
    address: sale.address,
    salePriceCents: sale.salePriceCents,
    anthemUrl: agent.anthemUrl ?? settings.defaultAnthemUrl,
    durationSec: settings.celebrationDurationSec,
  };
}
