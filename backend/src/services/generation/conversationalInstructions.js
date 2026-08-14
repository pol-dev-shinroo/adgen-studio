// Part EE §7 step 3 / §8: 생성 AI's own instruction-builder — a parallel,
// independent concern to renderImage.service.js's styleInstructionFor. This
// screen has no style-intensity slider; every decision here is already
// explicit per segment (keep/replace/custom), so there's no "how much
// influence" dial to describe — just what to actually do for each segment.
// Composes one instruction line per decision (background, each text
// segment, model, product), in the same imperative style as
// renderImage.service.js's own instruction functions. The real text-
// replacement MECHANICS (which original_text becomes which new_text) are
// handled separately by the reused replacementInstructionFor(replacements)
// — this only covers the parts that function doesn't: background/model
// handling, and free-text 'custom' notes for any segment.

function roleLabel(kind, segmentId) {
  if (kind === 'background') return 'Background'
  if (kind === 'model') return 'Model'
  if (kind === 'product') return 'Product'
  return `Text segment "${segmentId}"`
}

function instructionForDecision(kind, segmentId, decision) {
  const label = roleLabel(kind, segmentId)
  if (!decision || decision.mode === 'keep') {
    // LOW-intensity-style wording, per the spec: "preserve as in the
    // original ad" — decision.value (a picked factual value, for a text
    // segment's mode:'keep' case) is additive context, not a replace.
    return decision?.value
      ? `${label}: preserve as in the original ad, but use this specific value where a fact must differ — "${decision.value}".`
      : `${label}: preserve as in the original ad.`
  }
  if (decision.mode === 'replace') {
    return `${label}: replace with the provided reference image, described as: our own brand's ${kind === 'text' ? 'copy-style' : kind}-type extracted reference for this role.`
  }
  // 'custom' — the user's free text verbatim, clearly labeled with which
  // segment it applies to (§7 step 3's own explicit requirement).
  return `${label} (custom instruction): ${decision.value}`
}

// decisions: the exact shape AIStudioContext.jsx's state model uses —
// { background: Decision|null, texts: {[segmentId]: Decision}, model:
// Decision|null, product: Decision|null }. productInstances/replacements
// are additive context (not required to produce a valid instruction string
// on their own) — productInstances only used to note instance count when
// there's more than one; replacements only used to note when analysis
// genuinely found nothing to replace, so the text decisions above aren't
// silently ignored.
export function buildConversationalInstructions(decisions, { productInstances = [], replacements = [] } = {}) {
  const parts = [instructionForDecision('background', null, decisions.background)]

  Object.entries(decisions.texts || {}).forEach(([segmentId, decision]) => {
    parts.push(instructionForDecision('text', segmentId, decision))
  })

  if (decisions.model) {
    parts.push(instructionForDecision('model', null, decisions.model))
  }

  const instanceNote = productInstances.length > 1 ? ` (${productInstances.length} instances in the original ad)` : ''
  parts.push(instructionForDecision('product', null, decisions.product) + instanceNote)

  if (replacements.length === 0 && Object.keys(decisions.texts || {}).length > 0) {
    parts.push(
      'Note: analysis found no specific text replacements to apply — follow the text segment decisions above using ' +
      'your own best judgment for exact wording.'
    )
  }

  return parts.join('\n\n')
}
