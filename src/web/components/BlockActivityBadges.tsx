import React from 'react';

export interface BlockActivityProps {
  block: {
    height?: number;
    user_tx_count?: number | null;
    transfer_volume_amount?: number | null;
    glyphs?: Array<{ op_label: string; edition: number }>;
    glyph_count?: number | null;
    attestations?: Array<{ task_type: string }>;
    attestation_count?: number | null;
  };
}

export default function BlockActivityBadges({ block }: BlockActivityProps) {
  const glyphs = block?.glyphs ?? [];
  const glyphCount = block?.glyph_count ?? glyphs.length;
  const attestations = block?.attestations ?? [];
  const attestCount = block?.attestation_count ?? attestations.length;
  const userTxCount = Number(block?.user_tx_count ?? 0);
  const transferAmount = Number(block?.transfer_volume_amount ?? 0);
  const hasTransfers = userTxCount > 0 && transferAmount > 0;

  const hasAnyActivity = glyphCount > 0 || attestCount > 0 || hasTransfers;

  if (!hasAnyActivity) {
    return (
      <span className="badge pos" style={{ opacity: 0.5, borderColor: 'rgba(255, 255, 255, 0.08)' }}>
        STAKING
      </span>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
      {glyphCount > 0 && (
        <>
          {glyphs.length > 0 ? (
            glyphs.slice(0, 2).map((g, idx) => (
              <span key={idx} className="badge glyph" title={`PoUS Artifact ${g.op_label} #${g.edition}`}>
                {g.op_label === 'MINT' ? `GLYPH MINT #${g.edition}` : `GLYPH XFER #${g.edition}`}
              </span>
            ))
          ) : (
            <span className="badge glyph">
              GLYPH ({glyphCount})
            </span>
          )}
        </>
      )}

      {attestCount > 0 && (
        <span className="badge attestation" title="PoUS AI Consensus Attestation">
          AI ATTEST{attestCount > 1 ? ` (${attestCount})` : ''}
        </span>
      )}

      {hasTransfers && (
        <span className="badge transfer" title="Direct value transfer">
          TRANSFER{userTxCount > 1 ? ` (${userTxCount})` : ''}
        </span>
      )}
    </div>
  );
}
