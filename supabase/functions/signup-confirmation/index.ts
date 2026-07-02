// supabase/functions/signup-confirmation/index.ts
//
// Target of a Supabase Database Webhook: INSERT on `organizations`.
// Sends the new org a "you're in" confirmation via Resend so the landing
// page's promise ("first digest arrives Monday") stays honest.
//
// Deploy with --no-verify-jwt; auth is the shared CONFIRM_WEBHOOK_SECRET header
// (configure the webhook to send  x-webhook-secret: <CONFIRM_WEBHOOK_SECRET>).
//
// Env (function secrets): RESEND_API_KEY, CONFIRM_WEBHOOK_SECRET
//   + config: MAIL_FROM, UNSUBSCRIBE_BASE_URL, MAILING_ADDRESS

const FROM = Deno.env.get('MAIL_FROM') ?? 'GrantEquity <onboarding@resend.dev>';

function unsubscribeUrl(token?: string | null): string | null {
  const base = Deno.env.get('UNSUBSCRIBE_BASE_URL');
  if (!base || !token) return null;
  return `${base.replace(/\/$/, '')}/unsubscribe?token=${token}`;
}

function confirmationHtml(org: any): string {
  const name = org.name || 'there';
  const unsubUrl = unsubscribeUrl(org.unsubscribe_token);
  const address = Deno.env.get('MAILING_ADDRESS') ?? '';

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#1a1a1a;">
    <div style="border-bottom:3px solid #2d6a4f;padding-bottom:16px;margin-bottom:20px;">
      <h1 style="margin:0;color:#2d6a4f;font-size:22px;">🌱 You're in, ${name}!</h1>
    </div>
    <p style="font-size:15px;line-height:1.6;">
      Thanks for signing up for <strong>GrantEquity</strong> — a free service that finds
      grant opportunities for New Jersey nonprofits.
    </p>
    <p style="font-size:15px;line-height:1.6;">
      Your first personalized grant digest will arrive <strong>this coming Monday</strong>,
      and every Monday after that. We search federal, NJ state, and foundation sources
      matched to your focus areas, and send you only the grants worth your time.
    </p>
    <p style="font-size:15px;line-height:1.6;color:#555;">
      Nothing else to do for now — keep an eye on your inbox Monday morning.
    </p>
    <div style="border-top:1px solid #e0e0e0;margin-top:24px;padding-top:16px;font-size:12px;color:#999;line-height:1.6;">
      <p style="margin:0 0 8px;">You're receiving this because you signed up at grantequity.org.</p>
      ${
        unsubUrl
          ? `<p style="margin:0 0 8px;">Didn't sign up or changed your mind? <a href="${unsubUrl}" style="color:#2d6a4f;">Unsubscribe here</a>.</p>`
          : ''
      }
      ${address ? `<p style="margin:0;color:#bbb;">${address}</p>` : ''}
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('CONFIRM_WEBHOOK_SECRET');
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
  const org = payload.record;
  if (!org?.email) return new Response('No email in record', { status: 200 });

  const unsubUrl = unsubscribeUrl(org.unsubscribe_token);
  const headers: Record<string, string> = unsubUrl
    ? { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : {};

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [org.email],
      subject: "🌱 You're in — your first GrantEquity digest arrives Monday",
      html: confirmationHtml(org),
      headers,
      tags: org.id ? [{ name: 'org_id', value: String(org.id) }] : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Resend error', res.status, body);
    return new Response('Resend error', { status: 502 });
  }

  return new Response('ok', { status: 200 });
});
