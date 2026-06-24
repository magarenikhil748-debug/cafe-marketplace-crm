export const asyncHandler = <TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
) => fn


