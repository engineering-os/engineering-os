export class AppError {
  constructor(
    public readonly code: string,
    public readonly message: string
  ) {}
}

export class Result<T, E> {
  private constructor(
    private readonly value_: T | undefined,
    private readonly error_: E | undefined
  ) {}

  static ok<T, E = never>(value: T): Result<T, E> {
    return new Result<T, E>(value, undefined);
  }

  static err<E, T = never>(error: E): Result<T, E> {
    return new Result<T, E>(undefined, error);
  }

  isOk(): boolean {
    return this.error_ === undefined;
  }

  isErr(): boolean {
    return this.error_ !== undefined;
  }

  get value(): T {
    if (this.error_ !== undefined) throw new Error('Cannot get value of error result');
    return this.value_ as T;
  }

  get error(): E {
    if (this.error_ === undefined) throw new Error('Cannot get error of ok result');
    return this.error_ as E;
  }
}
