const mongoose = require('mongoose');  
const router = require('express').Router();
const Centre = require('../models/centre');
// POST /api/centres : créer un centre
router.post('/', async (req, res) => {
  try {
    const { title, region } = req.body;

    const s = await Centre.create({
      title: String(title || '').trim(),
      region: String(region || '').trim(),
    });

    return res.status(201).json({ ok: true, centre: s });
  } catch (e) {
    // Doublon d’index unique
    if (e?.code === 11000 && (e.keyPattern?.title || e.message?.includes('title_1 dup key'))) {
      return res.status(409).json({ error: 'المركز موجود بالفعل' }); // "Title already exists"
    }
    console.error('CENTRE CREATE ERROR:', e);
    return res.status(400).json({ error: e.message });
  }
});
// GET /api/centres : lister
router.get('/', async (_req, res) => {
  const centres = await Centre.find().sort({ title: 1 });
  res.json(centres);
});
// GET /api/centres/:id : détail + étapes
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // id invalide → 400
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid centre id' });
    }

    // projection minimale + lean() pour la perf
    const s = await Centre.findById(id)
      .select('title region')
      .lean()
      .exec();

    if (!s) return res.sendStatus(404);

    // normalisation optionnelle des dates (YYYY-MM-DD)

    return res.json({
      _id: s._id,
      title: s.title ?? '',
      region: s.region ?? '',
    });
  } catch (err) {
    next(err); // laisse le middleware d’erreur gérer
  }
});
// DELETE /api/centres/:id  (cascade sans transaction)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Valider l'id
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid id format' });
    }

    // 2) Existe ?
    const exists = await Centre.exists({ _id: id });
    if (!exists) return res.sendStatus(404);


    // 4) Supprimer le centre
    const rCentre = await Centre.deleteOne({ _id: id });

    // 5) Réponse (ou res.sendStatus(204) si tu préfères)
    return res.status(200).json({
      deleted: rCentre.deletedCount === 1//,
    });
  } catch (e) {
    console.error('DELETE /centers  error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});


// PATCH /api/centres/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid center id' });
    }

    // 1) Normaliser l’entrée
    let {
      title,
      region,
    } = req.body || {};

    // 2) Mettre à jour en remplaçant ENTIEREMENT le tableau
    const update = {
      ...(title != null && { title }),
      ...(region != null && { region }),
       // ⬅️ remplace totalement le tableau (y compris vide)
    };

    const updated = await Centre.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true } // important
    ).lean();

    if (!updated) return res.sendStatus(404);
    return res.json({ ok: true, _id: updated._id });
  } catch (err) {
    next(err);
  }
});
module.exports = router;