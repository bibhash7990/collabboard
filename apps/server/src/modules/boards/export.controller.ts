import PDFDocument from 'pdfkit';
import type { ActionItem } from '@collabboard/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireBoardRole } from '../../services/access';
import { generateActionItems } from '../../services/ai';
import { boardDocs } from '../../realtime/manager';
import { BoardMembership } from '../../models';

/** Extract raw bytes from a `data:image/png;base64,...` URL, or null if not embeddable. */
function decodeDataUrl(value: unknown): Buffer | null {
  if (typeof value !== 'string') return null;
  const match = /^data:image\/(?:png|jpe?g);base64,(.+)$/i.exec(value);
  return match ? Buffer.from(match[1], 'base64') : null;
}

/**
 * Server-rendered meeting-summary PDF — viewer+. Assembles title, participants, an
 * optional embedded canvas image, the notes text, and AI action items (either the
 * ones the client already computed, or freshly generated from the notes). All async
 * work happens before we touch response headers, so any failure is a clean JSON error
 * rather than a corrupt stream.
 */
export const exportPdf = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  const { board } = await requireBoardRole(userId, boardId, 'viewer');

  const memberDocs = await BoardMembership.find({ board: boardId })
    .populate('user', 'name email avatarColor')
    .lean();
  const members = memberDocs.map((m) => {
    const user = m.user as unknown as { name?: string; email?: string } | null;
    return { name: user?.name ?? 'Unknown', email: user?.email ?? '', role: m.role };
  });

  const notesText = await boardDocs.getNotesText(boardId);
  const provided = Array.isArray(req.body?.actionItems)
    ? (req.body.actionItems as ActionItem[])
    : null;
  const items = provided ?? (await generateActionItems(notesText)).items;
  const canvasImage = decodeDataUrl(req.body?.canvasPng);

  const safeName = board.title.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60) || 'board';
  const doc = new PDFDocument({
    margin: 50,
    size: 'A4',
    info: { Title: `${board.title} — Summary` },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}-summary.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(24).fillColor('#111827').text(board.title);
  doc.moveDown(0.25);
  doc
    .fontSize(10)
    .fillColor('#6b7280')
    .text(`Meeting summary · generated ${new Date().toLocaleString()}`);
  doc.moveDown();

  // Participants
  doc.fontSize(14).fillColor('#111827').text('Participants');
  doc.moveDown(0.25).fontSize(10).fillColor('#374151');
  if (members.length === 0) doc.text('No members.');
  for (const m of members) doc.text(`• ${m.name}${m.email ? ` <${m.email}>` : ''} — ${m.role}`);
  doc.moveDown();

  // Optional canvas snapshot
  if (canvasImage) {
    doc.fontSize(14).fillColor('#111827').text('Board snapshot');
    doc.moveDown(0.25);
    try {
      doc.image(canvasImage, { fit: [500, 320], align: 'center' });
      doc.moveDown();
    } catch {
      doc.fontSize(10).fillColor('#b91c1c').text('(Canvas image could not be embedded.)');
      doc.moveDown();
    }
  }

  // Notes
  doc.fontSize(14).fillColor('#111827').text('Notes');
  doc.moveDown(0.25);
  doc
    .fontSize(10)
    .fillColor('#374151')
    .text(notesText.trim() ? notesText : 'No notes captured yet.');
  doc.moveDown();

  // Action items
  doc.fontSize(14).fillColor('#111827').text('Action items');
  doc.moveDown(0.25).fontSize(10).fillColor('#374151');
  if (items.length === 0) doc.text('No action items detected.');
  for (const it of items) {
    const meta = [
      it.owner ? `@${it.owner}` : null,
      it.due ? `due ${it.due}` : null,
      `confidence ${Math.round(it.confidence * 100)}%`,
    ]
      .filter(Boolean)
      .join(' · ');
    doc.text(`☐ ${it.text}${meta ? `  (${meta})` : ''}`);
  }

  doc.end();
});
