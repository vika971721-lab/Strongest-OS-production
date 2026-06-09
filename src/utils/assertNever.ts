export const assertNever = (value: never, message = 'Unhandled case'): never => {
  throw new Error(`${message}: ${String(value)}`);
};
