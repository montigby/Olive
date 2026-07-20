// The prompt bank for the memories-of-the-deceased feature. Design basis
// (see 2026-07-20 scoping interview): specific, concrete prompts surface
// memories a generic one wouldn't -- StoryWorth's whole premise -- but the
// very FIRST prompt any recipient gets about a given person is always the
// generic one, to lower the barrier on that first response. Categories
// mirror the tribute-book framework researched during scoping (Modern
// Heirloom Books): rotating through category *types*, not just more prompts
// in one pile, is what keeps a monthly cadence from feeling repetitive for
// years. "Insignificant" is deliberately included -- trivial-sounding
// questions tend to unlock unexpectedly deep memories.

export const GENERIC_PROMPT_KEY = "generic";
export const GENERIC_PROMPT_TEMPLATE = "Share a memory of {ref}.";

export const PROMPT_CATEGORIES = [
  "introductory",
  "character",
  "memoryEliciting",
  "storytelling",
  "insignificant",
  "impact",
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

const PROMPT_BANK: Record<PromptCategory, string[]> = {
  introductory: [
    "How would you describe {ref} to someone who never met them?",
    "What's the first memory that comes to mind when you think of {ref}?",
    "What did a typical day with {ref} look like?",
    "What's a word or phrase you'd use to sum up {ref}?",
    "Where did you usually spend time with {ref}?",
    "What do you think {ref} was proudest of?",
    "What's something most people didn't know about {ref}?",
  ],
  character: [
    "What did {ref} value most in life?",
    "What made {ref} laugh?",
    "How did {ref} treat people they'd just met?",
    "What was {ref} like when things didn't go their way?",
    "What's a belief or value {ref} held strongly?",
    "How did {ref} show they cared about someone?",
    "What would {ref} never compromise on?",
  ],
  memoryEliciting: [
    "What was {ref}'s laugh like?",
    "What's a smell or song that instantly reminds you of {ref}?",
    "What did {ref}'s voice sound like when they were excited about something?",
    "Describe a moment you shared with {ref} that you still think about.",
    "What's something {ref} always seemed to be doing with their hands?",
    "What did {ref} look like when they were deep in thought?",
    "What's a place you'll always associate with {ref}?",
    "What was it like walking into a room {ref} was already in?",
  ],
  storytelling: [
    "What's a story {ref} loved to tell over and over?",
    "What's the funniest thing you ever saw {ref} do?",
    "Did {ref} have a favorite story from before you knew them?",
    "What's a family gathering you remember {ref} at?",
    "What's a trip or adventure you had with {ref}?",
    "Was there a tradition {ref} started or always kept alive?",
    "What's something {ref} did that became a family legend?",
  ],
  insignificant: [
    "Did {ref} have a phrase or saying they used all the time?",
    "What was {ref}'s go-to order at a restaurant?",
    "What was {ref}'s favorite color?",
    "What did {ref} always seem to have in their pockets or bag?",
    "What was {ref}'s morning routine like?",
    "What show, movie, or song could you always find {ref} enjoying?",
    "What did {ref}'s handwriting look like?",
  ],
  impact: [
    "What's something {ref} taught you that you still use today?",
    "How did {ref} shape who you've become?",
    "What's advice {ref} gave you that stuck?",
    "What do you find yourself doing now that reminds you of {ref}?",
    "What would you want {ref} to know about your life today?",
    "How did {ref} change the way you see family?",
    "What's something you wish you'd asked {ref} about?",
  ],
};

export interface PromptChoice {
  key: string;
  category: PromptCategory | null;
  text: string;
}

function keyFor(category: PromptCategory, index: number): string {
  return `${category}_${index}`;
}

/**
 * Picks the next prompt to send a given recipient about a given deceased
 * person, given the log of prompts already sent to that exact pair.
 * - No prior log rows -> always the generic prompt.
 * - Otherwise -> rotate through categories (round robin, skipping the most
 *   recently used one) and pick the first not-yet-sent prompt within it.
 * - If every prompt in the bank has been sent (years of monthly cadence),
 *   fall back to the least-recently-sent one -- repeats are an acceptable
 *   long-run outcome, not a failure case.
 */
export function pickNextPrompt(
  sentLog: Array<{ promptKey: string; category: string | null; sentAt: Date }>,
): PromptChoice {
  if (sentLog.length === 0) {
    return { key: GENERIC_PROMPT_KEY, category: null, text: GENERIC_PROMPT_TEMPLATE };
  }

  const sentKeys = new Set(sentLog.map((r) => r.promptKey));
  const lastCategory = [...sentLog].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0]?.category ?? null;
  const lastCategoryIdx = PROMPT_CATEGORIES.indexOf(lastCategory as PromptCategory);
  const startIdx = lastCategoryIdx === -1 ? 0 : (lastCategoryIdx + 1) % PROMPT_CATEGORIES.length;

  for (let offset = 0; offset < PROMPT_CATEGORIES.length; offset++) {
    const category = PROMPT_CATEGORIES[(startIdx + offset) % PROMPT_CATEGORIES.length]!;
    const prompts = PROMPT_BANK[category];
    for (let i = 0; i < prompts.length; i++) {
      const key = keyFor(category, i);
      if (!sentKeys.has(key)) {
        return { key, category, text: prompts[i]! };
      }
    }
  }

  // Bank exhausted for this pair -- repeat the least-recently-sent one.
  const oldest = [...sentLog].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())[0]!;
  const category = (oldest.category as PromptCategory) ?? PROMPT_CATEGORIES[0]!;
  const idx = Number(oldest.promptKey.split("_").pop());
  const text = PROMPT_BANK[category]?.[idx] ?? GENERIC_PROMPT_TEMPLATE;
  return { key: oldest.promptKey, category, text };
}

/** Renders a prompt template with a relationship-aware reference, e.g.
 * "your grandfather Robert" for a grandchild, "your brother Robert" for a
 * sibling. `relationshipLabel` comes from describeRelationship(). */
export function renderPrompt(template: string, relationshipLabel: string, firstName: string): string {
  const rel = relationshipLabel.toLowerCase();
  const ref = rel === "me" ? firstName : `your ${rel} ${firstName}`;
  return template.replace(/\{ref\}/g, ref);
}
