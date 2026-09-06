import { prisma } from './db';
import { createRepository } from './repository';
import type {
  UserInstrumentRelationship,
  Watchlist,
  Notification,
} from '@prisma/client';

export const relationshipRepo = createRepository<UserInstrumentRelationship>(
  prisma.userInstrumentRelationship as any,
  'Relationship'
);

export const watchlistRepo = createRepository<Watchlist>(prisma.watchlist as any, 'Watchlist');

export const notificationRepo = createRepository<Notification>(prisma.notification as any, 'Notification');

/**
 * WatchlistItem has no direct userId column -- ownership runs through its
 * parent Watchlist. Rather than hand-writing that join-check again, this
 * wraps watchlistRepo.findById (which already enforces userId) and only
 * then touches the item, so the same "no fetch without an owner check" rule
 * still holds one level down.
 */
export const watchlistItemRepo = {
  async addItem(watchlistId: string, userId: string, instrumentId: string) {
    await watchlistRepo.findById(watchlistId, userId); // throws 404 if not owned
    const count = await prisma.watchlistItem.count({ where: { watchlistId } });
    return prisma.watchlistItem.upsert({
      where: { watchlistId_instrumentId: { watchlistId, instrumentId } },
      update: {},
      create: { watchlistId, instrumentId, position: count },
      include: { instrument: true },
    });
  },
  async removeItem(watchlistId: string, userId: string, instrumentId: string) {
    await watchlistRepo.findById(watchlistId, userId);
    return prisma.watchlistItem.delete({ where: { watchlistId_instrumentId: { watchlistId, instrumentId } } });
  },
};
