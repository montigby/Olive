// Strips the quoted history from a plain-text email reply, leaving just
// what the sender actually typed. Deliberately a conservative heuristic
// (not a full parser like GitHub's email_reply_parser gem) -- covers the
// patterns real mail clients produce for a plain-text reply, which is all
// this needs: Gmail/Apple Mail/most webmail ("On <date>, <name> wrote:"
// followed by ">"-quoted lines), Outlook's manual header block, and the
// classic "-----Original Message-----" separator. Never throws; a pattern
// that doesn't match just means the whole text passes through untouched.
const CUT_PATTERNS: RegExp[] = [
  // "On Wed, Aug 20, 2026 at 4:56 PM Olive <notifications@myolive.app> wrote:"
  // -- bounded span so this can't accidentally eat the entire message if a
  // legitimate reply happens to contain the word "wrote" much later.
  /on[\s\S]{0,300}?wrote:/i,
  // Outlook's manual quote block, e.g. "From: Olive\nSent: ...\nTo: ...".
  /^from:\s.*$\s*^sent:\s.*$/im,
  /^-{2,}\s*original message\s*-{2,}$/im,
  // First line of `>`-quoted content (Gmail/Apple Mail plain-text quoting).
  /^>.*$/im,
];

export function stripQuotedReply(rawText: string): string {
  let cutIndex = rawText.length;
  for (const pattern of CUT_PATTERNS) {
    const match = pattern.exec(rawText);
    if (match && match.index < cutIndex) {
      cutIndex = match.index;
    }
  }
  return rawText.slice(0, cutIndex).trim();
}
