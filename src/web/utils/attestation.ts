/**
 * Canonical AI Attestation Label & Badge Resolver
 * 
 * Provides unified, protocol-compliant display labels across the Quavence Explorer.
 * Strictly aligned with PoUS Attestation Task Type taxonomy.
 */

export function resolveAttestationDisplayLabel(taskType: string | null | undefined): string {
  const raw = (taskType || '').toUpperCase().trim();
  if (raw.includes('INFERENCE') || raw.includes('EXTERNAL')) return 'EXTERNAL INFERENCE';
  if (raw.includes('EMBED')) return 'EMBEDDING';
  if (raw.includes('ORACLE') || raw.includes('VERDICT')) return 'ORACLE VERDICT';
  if (raw.includes('SUMMARY') || raw.includes('DIGEST')) return 'DIGEST';
  if (raw.includes('RISK') || raw.includes('FLAGS')) return 'RISK AUDIT';
  if (raw.includes('GOVERNANCE') || raw.includes('PROPOSAL')) return 'GOVERNANCE';
  if (raw.includes('RAG') || raw.includes('IDLE') || raw.includes('KNOWLEDGE')) return 'RAG VERIFICATION';
  if (raw.includes('HISTOR')) return 'HISTORY CONTEXT';
  if (raw.includes('OUTCOME') || raw.includes('RECAP')) return 'OUTCOME RECAP';
  if (raw.includes('COMPOSER')) return 'TASK COMPOSER';
  if (raw.includes('REVIEW') || raw.includes('CONSULTANT')) return 'REVIEW CONSULTANT';
  if (raw.includes('SCREEN') || raw.includes('SUBMISSION') || raw.includes('BOUNTY')) return 'SUBMISSION SCREEN';
  if (raw.includes('GLYPH') || raw.includes('NFT') || raw.includes('ART')) return 'AI GLYPH GEN';
  if (raw.includes('AGENT') || raw.includes('INTERACTION') || raw.includes('TURN')) return 'AGENT INTERACTION';
  if (raw.includes('DREAM') || raw.includes('CONSOLIDATION')) return 'DREAM CONSOLIDATION';
  return raw.replace('TASK_', '') || 'CONSENSUS';
}
