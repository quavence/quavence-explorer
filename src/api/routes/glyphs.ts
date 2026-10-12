import { Router } from 'express';
import { getGlyphsCatalog, getGlyphDetail } from '../../services/glyphService.js';

const router = Router();

// GET /api/glyphs
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string || '24', 10), 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string || '0', 10), 0);
    const search = (req.query.search as string || '').trim().toLowerCase();
    const rarity = (req.query.rarity as string || '').trim().toLowerCase();
    const sort = (req.query.sort as string || 'edition_asc').toLowerCase();

    const result = await getGlyphsCatalog({
      limit,
      offset,
      search,
      rarity,
      sort,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[API Error in /api/glyphs]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/glyphs/:idOrEdition
router.get('/:idOrEdition', async (req, res) => {
  try {
    const param = req.params.idOrEdition.trim();
    const glyph = await getGlyphDetail(param);

    if (!glyph) {
      return res.status(404).json({ error: 'PoUS Glyph not found in on-chain index' });
    }

    res.json(glyph);
  } catch (error: any) {
    console.error('[API Error in /api/glyphs/:idOrEdition]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
