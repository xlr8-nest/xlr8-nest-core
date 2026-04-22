import { Inject } from '@nestjs/common';
import { IUnitOfWorkToken } from '../types';

export function InjectUnitOfWork() {
  return Inject(IUnitOfWorkToken);
}

export function UnitOfWork() {
  return InjectUnitOfWork();
}
