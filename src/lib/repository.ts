import { ApiError } from './apiHelpers';

// Addendum 2 Section A1: userId is never optional here. A repository method
// that can fetch a row without a userId filter is exactly how IDOR bugs get
// introduced later by someone in a hurry -- so the type signature itself
// makes that mistake impossible to write, not just discouraged by
// convention. This formalizes the loadOwned/assertOwnership pattern that
// was previously hand-written per route (relationships, watchlists) into
// one shared implementation.

export interface PrismaDelegate<T> {
  findFirst(args: any): Promise<T | null>;
  findMany(args: any): Promise<T[]>;
  create(args: any): Promise<T>;
  update(args: any): Promise<T>;
  delete(args: any): Promise<T>;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Repository<T extends { id: string }> {
  findById(id: string, userId: string, include?: any): Promise<T>;
  list(userId: string, filters?: any, pagination?: { cursor?: string; limit?: number }, orderBy?: any): Promise<Page<T>>;
  create(userId: string, data: any): Promise<T>;
  update(id: string, userId: string, data: any): Promise<T>;
  delete(id: string, userId: string): Promise<T>;
}

/**
 * Builds a userId-scoped repository over any Prisma model that has a direct
 * `userId` column (UserInstrumentRelationship, Watchlist, Notification,
 * Checkpoint, BriefCache). Models one level removed from the user
 * (WatchlistItem, RelationshipEvent) go through their parent's repository
 * instead -- see watchlistItemRepo below for that pattern.
 */
export function createRepository<T extends { id: string }>(
  delegate: PrismaDelegate<T>,
  resourceName: string
): Repository<T> {
  return {
    async findById(id, userId, include) {
      const row = await delegate.findFirst({ where: { id, userId }, include });
      if (!row) throw new ApiError(404, `${resourceName} not found`);
      return row;
    },

    async list(userId, filters = {}, pagination = {}, orderBy = { createdAt: 'desc' }) {
      const limit = Math.min(pagination.limit ?? 20, 100);
      const items = await delegate.findMany({
        where: { userId, ...filters },
        orderBy,
        take: limit + 1,
        ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      });
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, limit) : items;
      return { items: page, nextCursor: hasMore ? (page[page.length - 1] as any).id : null };
    },

    async create(userId, data) {
      return delegate.create({ data: { ...data, userId } });
    },

    async update(id, userId, data) {
      await this.findById(id, userId);
      return delegate.update({ where: { id }, data });
    },

    async delete(id, userId) {
      await this.findById(id, userId);
      return delegate.delete({ where: { id } });
    },
  };
}
