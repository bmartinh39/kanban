// Shared input budgets for the UI, board API and assistant route.
export const fieldCharacterLimit = 20_000; // Card titles/details and list names.
export const idCharacterLimit = 100;
export const batchLimit = 20; // Board actions per save and assistant operations per plan.
export const chatMessageCharacterLimit = 4_000;
export const chatHistoryLimit = 20;
export const chatHistoryByteLimit = 64_000; // UTF-8 bytes; keeps assistant requests well under the request budget.
export const requestCharacterLimit = 200_000;
export const nameDisplayLimit = 80; // Card/list names quoted in assistant outcome messages.

export const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

export function clip(value: string, limit: number) {
  if (value.length <= limit) return value;
  // Never split a surrogate pair, so clipped text stays valid UTF-8.
  const end = /[\uD800-\uDBFF]/.test(value[limit - 2]) ? limit - 2 : limit - 1;
  return `${value.slice(0, end)}…`;
}
