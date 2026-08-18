'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { TvListing } from '@/lib/types';
import { formatMoney } from '@/lib/format';

function ListingPhoto({ photoUrl, address }: { photoUrl: string | null; address: string }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={address}
        className="h-48 w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return <div className="flex h-48 w-full items-center justify-center bg-panel-2 text-6xl">🏠</div>;
}

export default function ListingsSlide({ listings }: { listings: TvListing[] }) {
  return (
    <div className="flex h-full w-full flex-col px-16 py-12">
      <h1 className="font-display text-6xl text-neon neon-text">HOT LISTINGS</h1>
      {listings.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-4xl text-muted">No data yet</p>
        </div>
      ) : (
        <div className="mt-10 grid flex-1 content-start grid-cols-4 gap-6 overflow-hidden">
          {listings.map((listing, i) => (
            <motion.div
              key={listing.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.07, duration: 0.35 }}
              className="flex h-[400px] flex-col overflow-hidden rounded-xl bg-panel"
            >
              <ListingPhoto key={listing.photoUrl ?? 'none'} photoUrl={listing.photoUrl} address={listing.address} />
              <div className="flex flex-1 flex-col justify-between p-5">
                <p className="truncate font-heading text-2xl leading-tight text-ink">{listing.address}</p>
                <div className="mt-3">
                  <p className="font-display text-3xl text-neon neon-text">
                    {formatMoney(listing.listPriceCents)}
                  </p>
                  <p className="mt-1 truncate text-xl text-muted">{listing.agentName}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
