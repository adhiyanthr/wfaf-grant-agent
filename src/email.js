const RECIPIENTS = ['adhiyanth.r@gmail.com'];
const FROM = 'WFAF Grant Agent <onboarding@resend.dev>';

const CLOSING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Days from now until a deadline (negative = past). null if no/invalid deadline.
function daysUntil(deadline) {
  if (!deadline) return null;
  const d = new Date(deadline + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.ceil((d - Date.now()) / DAY_MS);
}

function isClosingSoon(g) {
  const days = daysUntil(g.deadline);
  return days !== null && days >= 0 && days <= CLOSING_SOON_DAYS;
}

// "Deadline: Month D, YYYY" or "Deadline: unknown"
function formatDeadline(deadline) {
  if (!deadline) return 'Deadline: unknown';
  const d = new Date(deadline + 'T00:00:00');
  if (isNaN(d)) return 'Deadline: unknown';
  const formatted = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `Deadline: ${formatted}`;
}

function formatAmount(min, max) {
  if (!min && !max) return null;
  if (max && !min) return `Up to $${max.toLocaleString()}`;
  if (min && !max) return `From $${min.toLocaleString()}`;
  if (min === max) return `$${min.toLocaleString()}`;
  return `$${min.toLocaleString()} – $${max.toLocaleString()}`;
}

function scoreColor(score) {
  if (score >= 9) return '#1a6b3a';
  if (score >= 7) return '#2d6a4f';
  return '#52796f';
}

function buildGrantCard(g, urgent) {
  const amount = formatAmount(g.amount_min, g.amount_max);
  const tags = (g.tags || []).map((t) => `#${t}`).join(' ');

  const days = daysUntil(g.deadline);
  const daysLeft = days !== null && days >= 0 ? ` (${days} day${days === 1 ? '' : 's'} left)` : '';
  const deadlineLabel = `${formatDeadline(g.deadline)}${daysLeft}`;

  // In "Closing Soon" cards the deadline is bold + colored for prominence.
  const deadlineHtml = urgent
    ? `<div style="font-size:14px; font-weight:700; color:#C0392B; margin-bottom:3px;">⏰ ${deadlineLabel}</div>`
    : `<div style="font-size:14px; color:#333;">${deadlineLabel}</div>`;

  return `
    <div style="
      border: 1px solid #d4e6d9;
      border-left: 4px solid ${urgent ? '#C0392B' : scoreColor(g.fit_score)};
      border-radius: 6px;
      padding: 16px 20px;
      margin-bottom: 16px;
      background: ${urgent ? '#fffaf9' : '#fafffe'};
    ">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <h3 style="margin: 0 0 4px; font-size: 15px; color: #1a1a1a; line-height: 1.4;">
          ${g.title}
        </h3>
        <span style="
          background: ${scoreColor(g.fit_score)};
          color: white;
          border-radius: 4px;
          padding: 2px 10px;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
        ">
          ${g.fit_score}/10
        </span>
      </div>

      <p style="margin: 2px 0 8px; color: #555; font-size: 14px;">${g.funder || 'Unknown funder'}</p>

      <div style="font-size: 14px; color: #333; margin-bottom: 8px;">
        ${amount ? `<div style="margin-bottom:3px;">💰 ${amount}</div>` : ''}
        ${deadlineHtml}
      </div>

      <p style="margin: 8px 0 6px; font-size: 14px; color: #444; font-style: italic;">
        ${g.fit_rationale || ''}
      </p>

      ${tags ? `<p style="margin: 4px 0 8px; font-size: 12px; color: #888;">${tags}</p>` : ''}

      <a href="${g.url}" style="
        display: inline-block;
        color: #2d6a4f;
        font-size: 14px;
        font-weight: 500;
        text-decoration: none;
        border: 1px solid #2d6a4f;
        padding: 4px 12px;
        border-radius: 4px;
        margin-top: 4px;
      ">View Grant →</a>
    </div>
  `;
}

function sectionHeader(text) {
  return `
    <h2 style="
      font-size: 16px;
      color: #2d6a4f;
      margin: 28px 0 14px;
      padding-bottom: 6px;
      border-bottom: 2px solid #d4e6d9;
    ">${text}</h2>
  `;
}

function buildEmail(grants) {
  // Section 1: deadline within 30 days, most urgent first.
  const closingSoon = grants
    .filter(isClosingSoon)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  // Section 2: everything else surfaced this run.
  const newThisWeek = grants.filter((g) => !isClosingSoon(g));

  const weekOf = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  let sections = '';
  if (closingSoon.length) {
    sections +=
      sectionHeader('⏰ Closing Soon — Act Now') +
      closingSoon.map((g) => buildGrantCard(g, true)).join('');
  }
  if (newThisWeek.length) {
    sections +=
      sectionHeader('🆕 New This Week') +
      newThisWeek.map((g) => buildGrantCard(g, false)).join('');
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 620px; margin: 0 auto; padding: 24px 16px; color: #1a1a1a;">

      <div style="border-bottom: 3px solid #2d6a4f; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="margin: 0 0 4px; color: #2d6a4f; font-size: 22px;">🌱 WFAF Grant Digest</h1>
        <p style="margin: 0; color: #666; font-size: 14px;">
          ${grants.length} grant${grants.length !== 1 ? 's' : ''} this week · Week of ${weekOf}
        </p>
      </div>

      ${sections}

      <div style="border-top: 1px solid #e0e0e0; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #999;">
        This digest is generated automatically each Monday by the WFAF Grant Agent.
        All amounts and deadlines should be verified at the source link before applying.
      </div>
    </div>
  `;
}

export async function sendDigest(grants) {
  if (!grants.length) return;

  const weekOf = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const subject = `🌱 ${grants.length} New Grant${grants.length !== 1 ? 's' : ''} for WFAF – ${weekOf}`;
  const html = buildEmail(grants);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: RECIPIENTS,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }

  const result = await res.json();
  console.log(`Email sent. Resend ID: ${result.id}`);
}
