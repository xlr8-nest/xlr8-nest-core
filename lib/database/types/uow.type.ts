export const IUnitOfWorkToken = 'IUnitOfWork';
export interface IUnitOfWork {
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
