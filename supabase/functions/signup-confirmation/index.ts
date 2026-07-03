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
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#16212b;">
    <div style="display:flex;align-items:center;gap:12px;border-bottom:1px solid #e6e9ed;padding-bottom:18px;margin-bottom:22px;">
      <span style="display:inline-block;width:40px;height:40px;border-radius:50%;background:#15616d;color:#fff;text-align:center;line-height:40px;font-size:20px;font-weight:600;">G</span>
      <span style="font-size:18px;font-weight:600;color:#16212b;">GrantEquity</span>
    </div>

    <h1 style="margin:0 0 14px;color:#16212b;font-size:22px;line-height:1.2;">You're in, ${name}.</h1>

    <p style="font-size:15px;line-height:1.65;color:#16212b;">
      Thanks for signing up for <strong>GrantEquity</strong> — a free service that finds
      the grants small nonprofits actually qualify for.
    </p>
    <p style="font-size:15px;line-height:1.65;color:#16212b;">
      Your first personalized set of matches arrives <strong>this coming Monday</strong>, and
      every Monday after that. Each week we search foundation, county, and state sources
      matched to your focus areas and location, and send you only the grants worth your time.
    </p>
    <p style="font-size:15px;line-height:1.65;color:#5a6775;">
      Want to see fit scores, eligibility flags, and the reasoning behind each match? You can
      review everything in the app anytime.
    </p>

    <p style="margin:24px 0 4px;">
      <a href="https://grantequity.org/login" style="display:inline-block;background:#15616d;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:8px;">
        Sign in to your matches →
      </a>
    </p>

    <p style="font-size:14px;line-height:1.65;color:#5a6775;margin-top:20px;">
      Nothing else to do for now — keep an eye on your inbox Monday morning. Just reply to this
      email if you have any questions.
    </p>

    <div style="border-top:1px solid #e6e9ed;margin-top:26px;padding-top:16px;font-size:12px;color:#626d79;line-height:1.6;">
      <p style="margin:0 0 8px;">You're receiving this because you signed up at grantequity.org.</p>
      ${
        unsubUrl
          ? `<p style="margin:0 0 8px;">Didn't sign up or changed your mind? <a href="${unsubUrl}" style="color:#15616d;">Unsubscribe here</a>.</p>`
          : ''
      }
      ${address ? `<p style="margin:0;color:#9aa4ae;">${address}</p>` : ''}
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
      subject: "You're in — your first GrantEquity matches arrive Monday",
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
