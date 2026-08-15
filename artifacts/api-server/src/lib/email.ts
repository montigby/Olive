const FROM = "Olive <notifications@myolive.app>";

async function getClient() {
  const { Resend } = await import("resend");
  return new Resend(process.env.RESEND_API_KEY);
}

// Brand tokens, matching artifacts/family-branch/src/index.css's --primary/--accent/--background
// and landing.tsx's hardcoded palette. Email clients strip custom @font-face and most <style>
// blocks, so everything here is inline and font stacks fall back to system serif/sans-serif
// rather than the app's actual DM Sans / Cormorant Garamond.
const BRAND_GREEN = "#6B7A46";
const BG = "#FAF8F5";
const CARD_BG = "#FFFFFF";
const TINT = "#F3F0EA";
const TEXT = "#333333";
const MUTED = "#6B6560";
const HAIRLINE = "#E8E2D8";

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";

/**
 * Shared shell every email renders inside. Table-based layout (not flex/grid) for
 * Outlook's Word rendering engine; every style is inline since Gmail and others strip
 * <head><style> blocks unpredictably. Grandparents are a large share of the recipient
 * list, so body text stays at 16px+ with strong contrast rather than anything smaller/lighter.
 */
function renderEmailShell({ preheader, bodyHtml }: { preheader: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Olive</title>
</head>
<body style="margin:0; padding:0; background-color:${BG};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px; background-color:${CARD_BG}; border-radius:16px;">
          <tr>
            <td align="center" style="padding: 28px 32px 16px 32px;">
              <span style="font-family: ${SERIF}; font-size:22px; font-weight:700; color:${BRAND_GREEN}; letter-spacing:0.2px;">Olive</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px;"><hr style="border:none; border-top:1px solid ${HAIRLINE}; margin:0;" /></td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 8px 32px; font-family: ${SANS}; font-size:16px; line-height:1.6; color:${TEXT};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 28px 32px;">
              <hr style="border:none; border-top:1px solid ${HAIRLINE}; margin:0 0 16px 0;" />
              <p style="font-family: ${SANS}; font-size:12px; color:${MUTED}; margin:0; line-height:1.5;">
                Olive &mdash; <a href="https://myolive.app" style="color:${MUTED};">myolive.app</a><br />
                Your family's private directory.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0 4px 0;">
    <tr>
      <td align="center" style="border-radius:999px; background-color:${BRAND_GREEN};">
        <a href="${href}" style="display:inline-block; padding:13px 28px; font-family: ${SANS}; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:999px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

export async function sendDayBeforeReminder({
  to,
  recipientName,
  birthdayPersonName,
  birthdayPersonId,
  age,
}: {
  to: string;
  recipientName: string;
  birthdayPersonName: string;
  birthdayPersonId: string;
  age: number | null;
}) {
  const ageText = age ? ` (turning ${age})` : "";
  const link = `https://myolive.app/members/${birthdayPersonId}`;

  const client = await getClient();
  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: `${birthdayPersonName}'s birthday is tomorrow`,
    html: buildDayBeforeHtml(recipientName, birthdayPersonName, ageText, link),
    text: `Hi ${recipientName},\n\nJust a reminder that ${birthdayPersonName} has a birthday tomorrow${ageText}.\n\nDon't forget to reach out! ${link}\n\n— Olive\nhttps://myolive.app`,
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

export async function sendOwnBirthdayReminder({
  to,
  recipientName,
  age,
}: {
  to: string;
  recipientName: string;
  age: number | null;
}) {
  const ageText = age ? ` — you're turning ${age}!` : "";

  const client = await getClient();
  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: `Happy almost-birthday, ${recipientName}! 🎉`,
    html: buildOwnBirthdayHtml(recipientName, ageText),
    text: `Hi ${recipientName},\n\nJust a heads up from the whole family — your birthday is tomorrow${ageText}\n\nWe hope it's a wonderful day. Enjoy it!\n\n— Olive\nhttps://myolive.app`,
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

export async function sendWeeklyDigest({
  to,
  recipientName,
  unitId,
  upcomingBirthdays,
}: {
  to: string;
  recipientName: string;
  unitId: string;
  upcomingBirthdays: Array<{
    name: string;
    daysUntil: number;
    dateFormatted: string;
    age: number | null;
    personId: string;
  }>;
}) {
  const client = await getClient();
  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: `Upcoming birthdays in your family`,
    html: buildWeeklyDigestHtml(recipientName, upcomingBirthdays),
    text: buildWeeklyDigestText(recipientName, upcomingBirthdays),
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

export async function sendClaimPendingNotification({
  to,
  adminName,
  claimerName,
  unitName,
}: {
  to: string;
  adminName: string;
  claimerName: string;
  unitName: string;
}) {
  const client = await getClient();
  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: `${claimerName} wants to join ${unitName}`,
    html: buildClaimNotificationHtml(adminName, claimerName, unitName),
    text: `Hi ${adminName},\n\n${claimerName} has requested to join ${unitName} on Olive and is waiting for your approval.\n\nReview it here: https://myolive.app/settings\n\n— Olive\nhttps://myolive.app`,
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

export async function sendPasswordResetEmail({
  to,
  token,
}: {
  to: string;
  token: string;
}) {
  const link = `https://myolive.app/reset-password?token=${encodeURIComponent(token)}`;

  const client = await getClient();
  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: "Reset your Olive password",
    html: buildPasswordResetHtml(link),
    text: `We received a request to reset your Olive password.\n\nReset it here (link expires in 1 hour): ${link}\n\nIf you didn't request this, you can safely ignore this email -- your password won't change.\n\n— Olive\nhttps://myolive.app`,
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

export async function sendMemoryPrompt({
  to,
  recipientName,
  personName,
  personId,
  promptText,
}: {
  to: string;
  recipientName: string;
  personName: string;
  personId: string;
  promptText: string;
}) {
  const client = await getClient();
  const link = `https://myolive.app/members/${personId}`;
  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: `A memory of ${personName}`,
    html: buildMemoryPromptHtml(recipientName, promptText, link),
    text: `Hi ${recipientName},\n\n${promptText}\n\nShare it here: ${link}\n\n(Don't want prompts about this person anymore? You can turn them off from their profile page.)\n\n— Olive\nhttps://myolive.app`,
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

function buildPasswordResetHtml(link: string): string {
  const body = `
    <p style="margin:0 0 12px 0;">We received a request to reset your Olive password.</p>
    <p style="margin:0 0 4px 0;">Click below to choose a new one. This link expires in 1 hour.</p>
    ${button("Reset your password", link)}
    <p style="margin: 20px 0 0 0; font-size:13px; color:${MUTED}; line-height:1.5;">
      If you didn't request this, you can safely ignore this email — your password won't change.
    </p>
  `;
  return renderEmailShell({ preheader: "Reset your Olive password", bodyHtml: body });
}

function buildMemoryPromptHtml(recipientName: string, promptText: string, link: string): string {
  const body = `
    <p style="margin:0 0 16px 0;">Hi ${recipientName},</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${TINT}; border-radius:12px; margin: 0 0 4px 0;">
      <tr>
        <td style="padding: 20px 20px;">
          <p style="margin:0; font-family: ${SERIF}; font-size:18px; font-style:italic; line-height:1.5; color:${TEXT};">${promptText}</p>
        </td>
      </tr>
    </table>
    ${button("Share it on Olive", link)}
    <p style="margin: 20px 0 0 0; font-size:13px; color:${MUTED}; line-height:1.5;">
      Don't want prompts about this person anymore? You can turn them off from their profile page.
    </p>
  `;
  return renderEmailShell({ preheader: promptText, bodyHtml: body });
}

function buildClaimNotificationHtml(adminName: string, claimerName: string, unitName: string): string {
  const body = `
    <p style="margin:0 0 12px 0;">Hi ${adminName},</p>
    <p style="margin:0 0 4px 0;">
      <strong>${claimerName}</strong> has requested to join <strong>${unitName}</strong> on Olive and is waiting for your approval.
    </p>
    ${button("Review the request", "https://myolive.app/settings")}
  `;
  return renderEmailShell({ preheader: `${claimerName} wants to join ${unitName}`, bodyHtml: body });
}

function buildOwnBirthdayHtml(recipientName: string, ageText: string): string {
  const body = `
    <p style="margin:0 0 12px 0;">Hi ${recipientName},</p>
    <p style="margin:0 0 4px 0;">
      Just a heads up from the whole family — your birthday is tomorrow${ageText} 🎉
    </p>
    <p style="margin:16px 0 0 0;">We hope it's a wonderful day. Enjoy it!</p>
  `;
  return renderEmailShell({ preheader: "Your birthday is tomorrow!", bodyHtml: body });
}

function buildDayBeforeHtml(recipientName: string, birthdayPersonName: string, ageText: string, link: string): string {
  const body = `
    <p style="margin:0 0 12px 0;">Hi ${recipientName},</p>
    <p style="margin:0 0 4px 0;">
      Just a reminder that <strong>${birthdayPersonName}</strong> has a birthday tomorrow${ageText}.
    </p>
    <p style="margin:16px 0 0 0;">Don't forget to reach out!</p>
    ${button(`View ${birthdayPersonName}'s profile`, link)}
  `;
  return renderEmailShell({ preheader: `${birthdayPersonName}'s birthday is tomorrow`, bodyHtml: body });
}

function buildWeeklyDigestHtml(
  recipientName: string,
  birthdays: Array<{ name: string; daysUntil: number; dateFormatted: string; age: number | null }>,
): string {
  const rows = birthdays
    .map(({ name, daysUntil, dateFormatted, age }, i) => {
      const when = daysUntil === 1 ? "Tomorrow" : daysUntil === 0 ? "Today" : `In ${daysUntil} days`;
      const ageText = age ? ` &mdash; turning ${age}` : "";
      const topBorder = i === 0 ? "none" : `1px solid ${HAIRLINE}`;
      return `<tr>
        <td style="padding: 12px 4px; border-top:${topBorder}; font-size: 15px;"><strong>${name}</strong>${ageText}</td>
        <td style="padding: 12px 4px; border-top:${topBorder}; font-size: 14px; color: ${MUTED}; text-align: right; white-space: nowrap;">${when} &middot; ${dateFormatted}</td>
      </tr>`;
    })
    .join("");

  const body = `
    <p style="margin:0 0 12px 0;">Hi ${recipientName},</p>
    <p style="margin:0 0 8px 0;">Here are the upcoming birthdays in your family this week:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 4px 0;">
      ${rows}
    </table>
    ${button("View all birthdays", "https://myolive.app/birthdays")}
  `;
  return renderEmailShell({ preheader: "Here's who's celebrating this week", bodyHtml: body });
}

function buildWeeklyDigestText(
  recipientName: string,
  birthdays: Array<{ name: string; daysUntil: number; dateFormatted: string; age: number | null }>,
): string {
  const lines = birthdays.map(({ name, daysUntil, dateFormatted, age }) => {
    const when = daysUntil === 1 ? "Tomorrow" : daysUntil === 0 ? "Today" : `In ${daysUntil} days`;
    const ageText = age ? ` (turning ${age})` : "";
    return `• ${name}${ageText} — ${when} · ${dateFormatted}`;
  });

  return `Hi ${recipientName},\n\nHere are the upcoming birthdays in your family this week:\n\n${lines.join("\n")}\n\n— Olive\nhttps://myolive.app`;
}
