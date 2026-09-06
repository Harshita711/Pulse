import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createWatchlistSchema = z.object({
  name: z.string().min(1).max(60),
});

export const addWatchlistItemSchema = z.object({
  instrumentId: z.string().min(1),
});

export const relationshipStatusEnum = z.enum([
  'OWN',
  'CONSIDERING',
  'WAITING_FOR_PRICE',
  'RESEARCHING',
  'WATCHING',
]);

export const createRelationshipSchema = z.object({
  instrumentId: z.string().min(1),
  status: relationshipStatusEnum,
  reason: z.string().max(1000).optional(),
  reconsiderCondition: z.string().max(500).optional(),
  targetPrice: z.number().positive().optional(),
  plannedAmount: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
  avgPrice: z.number().positive().optional(),
  trailingStopPct: z.number().min(0).max(100).optional(),
});

export const updateRelationshipSchema = createRelationshipSchema.partial().omit({ instrumentId: true });

export const buyTransitionSchema = z.object({
  quantity: z.number().positive(),
  avgPrice: z.number().positive(),
});

export const sellTransitionSchema = z.object({
  closedQuantity: z.number().positive(),
  closedPrice: z.number().positive(),
});

export const checkpointSchema = z.object({
  watchlistId: z.string().min(1),
  deviceId: z.string().min(1),
});

export const sensitivitySchema = z.object({
  sensitivity: z.enum(['QUIET', 'BALANCED', 'HIGH']),
});

export const onboardingSchema = z.object({
  picks: z
    .array(
      z.object({
        instrumentId: z.string().min(1),
        status: relationshipStatusEnum,
      })
    )
    .min(1)
    .max(20),
});

export const budgetSchema = z.object({
  monthlyIncome: z.number().nonnegative().optional(),
  monthlyBudget: z.number().nonnegative().optional(),
});
