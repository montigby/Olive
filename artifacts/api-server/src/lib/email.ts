const FROM = "Olive <notifications@myolive.app>";

async function getClient() {
  const { Resend } = await import("resend");
  return new Resend(process.env.RESEND_API_KEY);
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
  const today = new Date().toISOString().slice(0, 10);

  const client = await getClient();
  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: `${birthdayPersonName}'s birthday is tomorrow`,
    html: buildDayBeforeHtml(recipientName, birthdayPersonName, ageText),
    text: `Hi ${recipientName},\n\nJust a reminder that ${birthdayPersonName} has a birthday tomorrow${ageText}.\n\nDon't forget to reach out!\n\n— Olive\nhttps://myolive.app`,
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

function buildMemoryPromptHtml(recipientName: string, promptText: string, link: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
  <p style="font-size: 16px;">Hi ${recipientName},</p>
  <p style="font-size: 18px; font-style: italic;">${promptText}</p>
  <p style="font-size: 16px;">
    <a href="${link}" style="color: #4A7C59; font-weight: 600;">Share it on Olive &rarr;</a>
  </p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">
    Don't want prompts about this person anymore? You can turn them off from their profile page.
  </p>
  <p style="font-size: 12px; color: #888;">
    Olive &mdash; <a href="https://myolive.app" style="color: #888;">myolive.app</a>
  </p>
</body>
</html>`;
}

function buildClaimNotificationHtml(adminName: string, claimerName: string, unitName: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
  <p style="font-size: 16px;">Hi ${adminName},</p>
  <p style="font-size: 16px;">
    <strong>${claimerName}</strong> has requested to join <strong>${unitName}</strong> on Olive
    and is waiting for your approval.
  </p>
  <p style="font-size: 16px;">
    <a href="https://myolive.app/settings" style="color: #4A7C59; font-weight: 600;">Review the request &rarr;</a>
  </p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">
    Olive &mdash; <a href="https://myolive.app" style="color: #888;">myolive.app</a>
  </p>
</body>
</html>`;
}

function getMondayDateString(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function buildOwnBirthdayHtml(recipientName: string, ageText: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
  <p style="font-size: 16px;">Hi ${recipientName},</p>
  <p style="font-size: 16px;">
    Just a heads up from the whole family — your birthday is tomorrow${ageText} 🎉
  </p>
  <p style="font-size: 16px;">We hope it's a wonderful day. Enjoy it!</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">
    Olive &mdash; <a href="https://myolive.app" style="color: #888;">myolive.app</a>
  </p>
</body>
</html>`;
}

function buildDayBeforeHtml(recipientName: string, birthdayPersonName: string, ageText: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
  <p style="font-size: 16px;">Hi ${recipientName},</p>
  <p style="font-size: 16px;">
    Just a reminder that <strong>${birthdayPersonName}</strong> has a birthday
    tomorrow${ageText}.
  </p>
  <p style="font-size: 16px;">Don't forget to reach out!</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">
    Olive &mdash; <a href="https://myolive.app" style="color: #888;">myolive.app</a>
  </p>
</body>
</html>`;
}

function buildWeeklyDigestHtml(
  recipientName: string,
  birthdays: Array<{ name: string; daysUntil: number; dateFormatted: string; age: number | null }>,
): string {
  const rows = birthdays
    .map(({ name, daysUntil, dateFormatted, age }) => {
      const when = daysUntil === 1 ? "Tomorrow" : daysUntil === 0 ? "Today" : `In ${daysUntil} days`;
      const ageText = age ? ` &mdash; turning ${age}` : "";
      return `<tr>
        <td style="padding: 8px 0; font-size: 15px;"><strong>${name}</strong>${ageText}</td>
        <td style="padding: 8px 0; font-size: 15px; color: #555; text-align: right;">${when} &middot; ${dateFormatted}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
  <p style="font-size: 16px;">Hi ${recipientName},</p>
  <p style="font-size: 16px;">Here are the upcoming birthdays in your family this week:</p>
  <table style="width: 100%; border-collapse: collapse;">
    ${rows}
  </table>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">
    Olive &mdash; <a href="https://myolive.app" style="color: #888;">myolive.app</a>
  </p>
</body>
</html>`;
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
