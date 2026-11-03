export type BranchMutation = (
  path: string,
  body: unknown,
  key?: string,
) => Promise<void>;
