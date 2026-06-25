const RECIPIENTS = ['ggp@wfafnj.org', 'administrator@wfafnj.org'];
const FROM = 'WFAF Grant Agent <grants@wfafnj.org>';

function formatDeadline(deadline) {
  if (!deadline) return 'No deadline listed';
  const d = new Date(deadline + 'T00:00:00');
  const diff = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
  const formatted = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  if (diff <= 14) return `⚠️ ${formatted} (${diff} days)`;
  if (diff <= 30) return `⏰ ${formatted} (${diff} days)`;
  return `📅 ${formatted}`;
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

function buildGrantCard(g) {
  const amount = formatAmount(g.amount_min, g.amount_max);
  const deadline = formatDeadline(g.deadline);
  const tags = (g.tags || []).map((t) => `#${t}`).join(' ');

  return `
    <div style="
      border: 1px solid #d4e6d9;
      border-left: 4px solid ${scoreColor(g.fit_score)};
      border-radius: 6px;
      padding: 16px 20px;
      margin-bottom: 16px;
      background: #fafffe;
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
        <div>${deadline}</div>
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

function buildEmail(grants) {
  const sorted = [...grants].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  const weekOf = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const urgentCount = sorted.filter((g) => {
    if (!g.deadline) return false;
    const diff = Math.ceil((new Date(g.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    return diff <= 30;
  }).length;

  const urgentBanner =
    urgentCount > 0
      ? `<div style="background:#fff3cd; border:1px solid #ffc107; border-radius:6px; padding:12px 16px; margin-bottom:20px; font-size:14px; color:#664d00;">
          ⚠️ <strong>${urgentCount} grant${urgentCount > 1 ? 's' : ''}</strong> deadline within 30 days — review those first.
        </div>`
      : '';

  const cards = sorted.map(buildGrantCard).join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 620px; margin: 0 auto; padding: 24px 16px; color: #1a1a1a;">

      <div style="border-bottom: 3px solid #2d6a4f; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="margin: 0 0 4px; color: #2d6a4f; font-size: 22px;">🌱 WFAF Grant Digest</h1>
        <p style="margin: 0; color: #666; font-size: 14px;">
          ${sorted.length} new grant${sorted.length !== 1 ? 's' : ''} found · Week of ${weekOf}
        </p>
      </div>

      ${urgentBanner}
      ${cards}

      <div style="border-top: 1px solid #e0e0e0; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #999;">
        This digest is generated automatically each Monday by the WFAF Grant Agent.
        Grants are sorted by deadline. All amounts and deadlines should be verified at the source link before applying.
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
