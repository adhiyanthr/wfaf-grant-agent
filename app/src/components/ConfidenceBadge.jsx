// Visible partial-confidence badge. Rendered in the matches list (at a glance,
// not buried) and on the detail page. The email digest mirrors this label so
// there is no silent quality drop between channels.
export default function ConfidenceBadge({ confidence }) {
  if (confidence !== 'partial') return null;
  return (
    <span className="badge badge-partial" title="Scored from a limited web-search snippet, not the full eligibility page.">
      ⚠ Limited data
    </span>
  );
}
