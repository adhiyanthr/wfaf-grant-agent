import { getAdminPassword } from '../lib/adminSession'
import { TokenNav } from '../components/TokenNav'

// Plain-English ownership handoff guide for Wagner Farm staff. Static content,
// reachable from the Admin page (and soft-gated behind the same admin unlock —
// it contains nothing secret, but it's staff-facing, not visitor-facing).

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '1.15rem', marginBottom: '12px' }}>
        Step {n}: {title}
      </h2>
      {children}
    </div>
  )
}

export function TokenHandoff({ token }: { token: string }) {
  const adminHref = `/dashboard/${token}/admin`

  if (!getAdminPassword()) {
    return (
      <>
        <TokenNav token={token} active="admin" />
        <div className="container">
          <div className="card" style={{ textAlign: 'center', marginTop: '60px' }}>
            <h2 style={{ marginBottom: '10px' }}>Admins only</h2>
            <p className="muted" style={{ marginBottom: '16px' }}>
              Unlock the Admin area first to read the handoff guide.
            </p>
            <a href={adminHref} className="btn">Go to Admin →</a>
          </div>
        </div>
      </>
    )
  }

  const ol = { margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px' } as const

  return (
    <>
      <TokenNav token={token} active="admin" />
      <div className="container">
        <p style={{ marginBottom: '18px' }}>
          <a href={adminHref} style={{ color: 'var(--ink-2)' }}>← Back to Admin</a>
        </p>

        <h1 style={{ marginBottom: '8px' }}>Taking full ownership</h1>
        <p style={{ marginBottom: '28px', color: 'var(--ink-2)', maxWidth: '640px' }}>
          This service currently runs on accounts set up by the developer. Follow the steps below,
          in order, and everything — the website, the weekly search robot, and the AI it uses —
          ends up under Wagner Farm's own accounts. No programming is involved; each step is
          creating an account and clicking through settings. Budget about an hour in total.
        </p>

        <div className="card" style={{ marginBottom: '20px', background: 'var(--bg)' }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: '10px' }}>What you're taking over</h2>
          <ul style={ol}>
            <li><strong>The code &amp; the robot</strong> — lives on GitHub. The robot runs there every Monday morning and searches for grants.</li>
            <li><strong>The AI</strong> — the robot thinks using an Anthropic account. Whoever's account it is pays for the searches (typically a few dollars a month).</li>
            <li><strong>Everything else</strong> — the website hosting (Vercel), the grant database (Supabase), and the email sender (Resend). These can move later; the two above matter most.</li>
          </ul>
        </div>

        <Step n={1} title="Get the code and the robot (GitHub)">
          <ol style={ol}>
            <li>Create a free account at <strong>github.com</strong> (use an organization email like administrator@wfafnj.org).</li>
            <li>Tell the developer your new GitHub username and ask them to <em>transfer the repository</em> to you. (On their side it's: repository → Settings → scroll to "Danger Zone" → "Transfer ownership".)</li>
            <li>You'll get an email from GitHub — accept the transfer. The code, the Monday schedule, and all its settings now belong to your account.</li>
          </ol>
        </Step>

        <Step n={2} title="Switch the AI to your own account (the API key)">
          <p className="muted" style={{ marginBottom: '12px', fontSize: '0.92rem' }}>
            This moves the AI costs and control from the developer's Anthropic account to yours.
          </p>
          <ol style={ol}>
            <li>Create an account at <strong>console.anthropic.com</strong> and add a payment method (Billing). A few dollars of monthly usage is typical.</li>
            <li>In the console, go to <strong>API keys → Create key</strong>. Name it something like "grant robot" and copy the long key it shows you (it starts with <code>sk-ant-</code>). You only see it once — paste it somewhere safe for a minute.</li>
            <li>On GitHub, open your repository → <strong>Settings → Secrets and variables → Actions</strong>.</li>
            <li>Under "Repository secrets", find <strong>ANTHROPIC_API_KEY</strong>, click the edit (pencil) icon, paste your new key, and save.</li>
            <li>Done — from the next run onward, the robot thinks on your account. The developer can now delete their old key.</li>
          </ol>
        </Step>

        <Step n={3} title="Change both passwords">
          <ol style={ol}>
            <li>Go back to the <a href={adminHref}>Admin page</a>.</li>
            <li>Change the <strong>admin password</strong> first — after that, only Wagner Farm staff can open the Admin area.</li>
            <li>Change the <strong>site password</strong> if you want a fresh one, and share it with the staff who should see the dashboard.</li>
          </ol>
        </Step>

        <Step n={4} title="Later, when convenient: the remaining accounts">
          <p className="muted" style={{ marginBottom: '12px', fontSize: '0.92rem' }}>
            These keep working as-is under the developer's accounts; move them whenever you're ready,
            with the developer on a call. Same pattern each time: create your account, they transfer
            the project, and where there's a key it gets swapped in the same GitHub "Repository
            secrets" page as Step 2.
          </p>
          <ul style={ol}>
            <li><strong>Resend</strong> (sends the emails) — new key goes into the <code>RESEND_API_KEY</code> secret.</li>
            <li><strong>Supabase</strong> (the grant database) — the project can be transferred to your Supabase organization in its settings.</li>
            <li><strong>Vercel</strong> (hosts this website) — the project can be transferred to your Vercel team in its settings.</li>
          </ul>
        </Step>

        <div style={{ textAlign: 'center', padding: '20px 20px 40px', color: 'var(--ink-2)' }}>
          <p>Stuck on any step? Ask the developer to walk through it with you — none of them take more than a few minutes together.</p>
        </div>
      </div>
    </>
  )
}
