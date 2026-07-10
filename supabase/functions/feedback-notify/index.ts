// supabase/functions/feedback-notify/index.ts
//
// Target of a Supabase Database Webhook: INSERT on `match_feedback`.
// Emails grants@grantequity.org whenever an org submits in-app feedback
// (Not relevant / Already applied / More like this) or a direct message,
// with Reply-To set to the org so a human can just hit reply.
//
// Deploy with --no-verify-jwt; auth is the shared FEEDBACK_WEBHOOK_SECRET header
// (configure the webhook to send  x-webhook-secret: <FEEDBACK_WEBHOOK_SECRET>).
//
// Env (function secrets): RESEND_API_KEY, FEEDBACK_WEBHOOK_SECRET, MAIL_FROM
//   + SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase).

const FROM = Deno.env.get('MAIL_FROM') ?? 'GrantEquity <onboarding@resend.dev>';
const TO = 'grants@grantequity.org';

const RESPONSE_LABELS: Record<string, string> = {
  not_relevant: 'Not relevant',
  already_applied: 'Already applied',
  more_like_this: 'More like this',
  message: 'Message',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Enrich the raw feedback row with org + grant context via PostgREST using the
// service-role key. Any failure degrades to ids-only — never lose the email.
async function fetchRow(table: string, select: string, id: string): Promise<any | null> {
  try {
    const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?select=${select}&id=eq.${id}&limit=1`;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('FEEDBACK_WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  // Supabase DB webhook shape: { type, table, record, old_record }.
  const fb = payload.record;
  if (!fb?.id) return new Response('No record', { status: 200 });

  const org = fb.org_id
    ? await fetchRow('organizations', 'name,email', fb.org_id)
    : null;
  const grant = fb.grant_id
    ? await fetchRow('grants', 'title,url', fb.grant_id)
    : null;

  const orgName = org?.name ?? `org ${fb.org_id ?? 'unknown'}`;
  const label = RESPONSE_LABELS[fb.response] ?? fb.response ?? 'Feedback';
  const isMessage = fb.response === 'message';

  const subject = isMessage
    ? `💬 Message from ${orgName}`
    : `📋 Feedback from ${orgName}: ${label}`;

  const lines = [
    `<p style="margin:0 0 8px;"><strong>Org:</strong> ${esc(orgName)}${org?.email ? ` &lt;${esc(org.email)}&gt;` : ''}</p>`,
    grant
      ? `<p style="margin:0 0 8px;"><strong>Grant:</strong> <a href="${esc(grant.url ?? '#')}">${esc(grant.title ?? fb.grant_id)}</a></p>`
      : fb.grant_id
        ? `<p style="margin:0 0 8px;"><strong>Grant id:</strong> ${esc(String(fb.grant_id))}</p>`
        : '',
    isMessage ? '' : `<p style="margin:0 0 8px;"><strong>Response:</strong> ${esc(label)}</p>`,
    fb.note
      ? `<p style="margin:0 0 8px;"><strong>${isMessage ? 'Message' : 'Note'}:</strong></p><blockquote style="margin:0 0 8px;padding:8px 12px;border-left:3px solid #15616d;background:#eef4f5;">${esc(fb.note)}</blockquote>`
      : '',
    `<p style="margin:0;color:#999;font-size:12px;">match_feedback ${esc(String(fb.id))} · ${esc(String(fb.created_at ?? ''))}</p>`,
  ].join('');

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#1a1a1a;">${lines}</div>`;

  const body: Record<string, unknown> = {
    from: FROM,
    to: [TO],
    subject,
    html,
    tags: fb.org_id ? [{ name: 'org_id', value: String(fb.org_id) }] : undefined,
  };
  if (org?.email) body.reply_to = org.email;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('Resend error', res.status, errBody);
    return new Response('Resend error', { status: 502 }); // webhook retries
  }

  return new Response('ok', { status: 200 });
});
