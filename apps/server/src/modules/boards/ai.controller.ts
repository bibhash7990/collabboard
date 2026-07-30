import type { GenerateActionItemsRequest } from '@collabboard/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireBoardRole } from '../../services/access';
import { generateActionItems } from '../../services/ai';
import { boardDocs } from '../../realtime/manager';

/**
 * Extract action items from the meeting notes — viewer+. Defaults to the board's
 * current notes text; callers may override with their own text (e.g. a selection).
 */
export const actionItems = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  const { text } = req.body as GenerateActionItemsRequest;
  await requireBoardRole(userId, boardId, 'viewer');

  const source = text ?? (await boardDocs.getNotesText(boardId));
  res.json(await generateActionItems(source));
});
