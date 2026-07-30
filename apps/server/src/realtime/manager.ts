import { BoardDocManager } from './BoardDocManager';

/**
 * Process-wide singleton. Imported by the socket gateway (to serve live docs)
 * and by REST route modules (export/AI/version-history) that need read/write
 * access to the same authoritative CRDT state.
 */
export const boardDocs = new BoardDocManager();
