export function NotFound() {
  return (
    <div className="center">
      <h1 style={{ fontSize: '2rem', marginBottom: '12px' }}>404</h1>
      <p style={{ marginBottom: '20px' }}>Page not found</p>
      <a href="/" className="btn">
        Back to home
      </a>
    </div>
  )
}
