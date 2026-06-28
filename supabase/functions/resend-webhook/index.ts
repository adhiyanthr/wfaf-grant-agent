// supabase/functions/resend-webhook/index.ts
//
// Receives Resend webhooks (delivered / opened / clicked / bounced /
// complained), verifies the Svix signature, and records engagement in
// email_events. org_id is read from the `org_id` tag we attach when sending,
// so no separate email->org mapping table is needed.
//
// Deploy with --no-verify-jwt; auth is the Svix signature.
// Register the endpoint in the Resend dashboard (Webhooks) and copy its
// signing secret into RESEND_WEBHOOK_SECRET.
//
// Env (function secrets): SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_WEBHOOK_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Webhook } from 'https://esm.sh/svix@1.24.0';

const TYPE_MAP: Record<string, string> = {
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

// Resend may send tags as [{name,value}] or as a { name: value } map.
function tagValue(tags: unknown, key: string): string | null {
  if (!tags) return null;
  if (Array.isArray(tags)) {
    const t = tags.find((x: any) => x?.name === key);
    return t?.value ?? null;
  }
  if (typeof tags === 'object') return (tags as Record<string, string>)[key] ?? null;
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) return new Response('Not configured', { status: 500 });

  const body = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  let evt: any;
  try {
    evt = new Webhook(secret).verify(body, headers);
  } catch (err) {
    console.error('Svix verification failed:', (err as Error).message);
    return new Response('Invalid signature', { status: 401 });
  }

  const type = TYPE_MAP[evt.type];
  if (!type) return new Response('ignored', { status: 200 }); // not a tracked event

  const data = evt.data ?? {};
  const orgId = tagValue(data.tags, 'org_id');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_KEY')!
  );

  const { error } = await supabase.from('email_events').insert({
    org_id: orgId,
    email_id: data.email_id ?? null,
    type,
    link_url: type === 'clicked' ? data.click?.link ?? null : null,
  });

  if (error) {
    console.error('Insert email_events error:', error.message);
    return new Response('db error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
