import { UUID } from "crypto";
import { ValueObject } from "./value-object";

export type Primitive = string | number | boolean | bigint | symbol | UUID;
export type KeyPart = Primitive | ValueObject;

export class CompositeKey<Parts extends readonly KeyPart[]> {
  private readonly parts: Readonly<Parts>;

  constructor(...parts: Parts) {
    this.parts = Object.freeze(parts) as Readonly<Parts>;
  }

  equals(other: CompositeKey<Parts> | undefined | null): boolean {
    if (this === other) return true;
    if (!other) return false;

    const a = this.parts;
    const b = other.parts;

    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      const av = a[i];
      const bv = b[i];

      if (av instanceof ValueObject && bv instanceof ValueObject) {

        if (!av.equals(bv)) 
          return false;
        
      } else if (av !== bv) {
        return false;
      }
    }

    return true;
  }

  toString(separator = ':'): string {
    return this.parts
      .map((part) => {
        if (part instanceof ValueObject) return part.toString();
        if (typeof part === 'symbol') return String(part);
        return String(part);
      })
      .join(separator);
  }

  unwrap(): Readonly<Parts> {
    return this.parts;
  }
}

export type Identifier = CompositeKey<readonly KeyPart[]> | KeyPart;
