import { CompositeKey, Identifier, KeyPart } from './type';

export abstract class Entity<T extends Identifier>{
  protected readonly _id: T;
  
  constructor(id: T) {
    this._id = id;
  }
  
  get id(): T {
    return this._id;
  }

  equals(other?: Entity<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (this === other) {
      return true;
    }

    if(this._id instanceof CompositeKey){
      if(!(other._id instanceof CompositeKey)){
        return false;
      }
      return this._id.equals(other._id as CompositeKey<readonly KeyPart[]>);
    }
    return this._id === other._id;
  }
}
