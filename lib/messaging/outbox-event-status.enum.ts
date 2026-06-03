export enum OutboxEventStatus {
  PENDING = 'pending',
  /** Row has been claimed by a worker and is being published. Lease expires after lockedUntil. */
  PROCESSING = 'processing',
  PUBLISHED = 'published',
  FAILED = 'failed',
}
