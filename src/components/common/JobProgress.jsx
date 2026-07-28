// Shared shape behind CollectionProgress.jsx/SyncProgress.jsx/
// GenerationProgress.jsx — all three are a phase-label line, a bar that's
// either percentage-filled or indeterminate depending on the job's current
// phase, and a "recent items" list, each just supplying its own job-specific
// phase→label mapping, percent-or-null rule, and per-item row markup.
//
// variant: 'collect' switches to CollectionProgress's original (feed.css's
// old .cp-*) spacing/sizing — the only one of the three that didn't already
// match the other two's look — via .job-progress.collect overrides in
// global.css. Default (no variant) matches Sync/GenerationProgress's
// original .sync-* look, since those two already matched each other exactly.
export default function JobProgress({ job, phaseLabel, percent, renderItem, variant }) {
  const progress = job?.progress ?? {}
  const items = progress.recentItems ?? []
  const pct = percent(progress)

  return (
    <div className={`job-progress${variant ? ` ${variant}` : ''}`}>
      <div className="job-progress-label">{phaseLabel(progress)}</div>
      <div className={`job-progress-bar${pct === null ? ' indeterminate' : ''}`}>
        {pct !== null && <div className="job-progress-bar-fill" style={{ width: `${pct}%` }} />}
      </div>

      {items.length > 0 && (
        <div className="job-progress-list">
          {items.map((item, i) => renderItem(item, i))}
        </div>
      )}
    </div>
  )
}
