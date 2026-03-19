export abstract class DomainService {
  protected guard(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(message);
    }
  }
}
