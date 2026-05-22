/**
 * Base class for TypeORM entities that supports partial construction.
 *
 * Lets you write
 *     new UserOrm({ id, email, createdAt });
 * instead of explicitly assigning every column. Subclasses declare their own
 * columns with TypeORM decorators; this base only provides the constructor.
 *
 * It is intentionally minimal — no ID field, no lifecycle columns, no soft-delete
 * column. Those belong to concrete entities so each table controls its own shape.
 */
export class BaseOrm<T> {
  constructor(orm: Partial<T>) {
    Object.assign(this, orm);
  }
}
