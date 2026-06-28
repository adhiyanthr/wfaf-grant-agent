// supabase/functions/unsubscribe/index.ts
//
// Public endpoint (deploy with --no-verify-jwt). Marks an org inactive by its
// unguessable unsubscribe_token. Handles both:
//   - GET  : a subscriber clicking the footer "Unsubscribe here" link
//   - POST : RFC 8058 one-click (List-Unsubscribe-Post) from Gmail/Outlook
//
// Once active=false, the weekly agent's getActiveOrgs() skips the org.
//
// Env (function secrets): SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:64px auto;padding:0 20px;color:#1a1a1a;text-align:center;">
<h1 style="color:#2d6a4f;">🌱 GrantEquity</h1>
${body}
</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

Deno.serve(async (req) => {
  const isPost = req.method === 'POST'; // one-click clients want a bare 2xx
  const token = new URL(req.url).searchParams.get('token');

  if (!token) {
    return isPost
      ? new Response('Missing token', { status: 400 })
      : page('Unsubscribe', '<p>This unsubscribe link is missing its token.</p>', 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_KEY')!
  );

  const { data, error } = await supabase
    .from('organizations')
    .update({ active: false, unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .select('email')
    .maybeSingle();

  if (error) {
    console.error('Unsubscribe error:', error.message);
    return isPost
      ? new Response('error', { status: 500 })
      : page('Unsubscribe', '<p>Something went wrong. Please reply to a digest email to unsubscribe.</p>', 500);
  }

  if (!data) {
    // Unknown/expired token — don't leak whether it existed; treat as done.
    return isPost
      ? new Response('ok', { status: 200 })
      : page('Unsubscribe', '<p>You are unsubscribed. No further grant digests will be sent.</p>');
  }

  return isPost
    ? new Response('ok', { status: 200 })
    : page(
        'Unsubscribed',
        `<p>You've been unsubscribed${data.email ? ` (<strong>${data.email}</strong>)` : ''}.</p>
<p style="color:#666;">You won't receive any more grant digests. Changed your mind? Just sign up again at grantequity.org.</p>`
      );
});
