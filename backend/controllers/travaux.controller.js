const { HttpError } = require('../services/travaux.service');

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError || (err && err.status && err.message)) {
        return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
      }
      console.error('travaux controller error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}

function createTravauxController(service) {
  return {
    list: wrap(async (req, res) => res.json(await service.list(req.query || {}))),
    getOne: wrap(async (req, res) => res.json(await service.getOne(req.params.id))),
    create: wrap(async (req, res) => res.status(201).json(await service.create(req.body || {}))),
    update: wrap(async (req, res) => res.json(await service.update(req.params.id, req.body || {}))),
    remove: wrap(async (req, res) => { await service.remove(req.params.id); res.status(204).send(); }),

    listTaches: wrap(async (req, res) => res.json(await service.listTaches(req.params.travauxId))),
    createTache: wrap(async (req, res) => res.status(201).json(await service.createTache(req.params.travauxId, req.body || {}))),
    getTache: wrap(async (req, res) => res.json(await service.getTache(req.params.id))),
    updateTache: wrap(async (req, res) => res.json(await service.updateTache(req.params.id, req.body || {}))),
    deleteTache: wrap(async (req, res) => { await service.deleteTache(req.params.id); res.status(204).send(); }),

    listMateriels: wrap(async (req, res) => res.json(await service.listMateriels(req.params.id))),
    createMateriel: wrap(async (req, res) => res.status(201).json(await service.createMateriel(req.params.id, req.body || {}))),
    patchMateriel: wrap(async (req, res) => res.json(await service.patchMateriel(req.params.travauxId, req.params.matId, req.body || {}))),
    deleteMateriel: wrap(async (req, res) => { await service.deleteMateriel(req.params.travauxId, req.params.matId); res.status(204).send(); }),

    addAgent: wrap(async (req, res) => res.status(201).json(await service.addAgent(req.params.id, req.body || {}))),
    removeAgent: wrap(async (req, res) => res.json(await service.removeAgent(req.params.id, req.params.matricule))),
    addResponsable: wrap(async (req, res) => res.status(201).json(await service.addResponsable(req.params.id, req.body || {}))),
    satisfaction: wrap(async (req, res) => res.status(201).json(await service.saveSatisfaction(req.params.id, req.body || {}, req.user))),

    createRendu: wrap(async (req, res) => res.status(201).json(await service.createRendu(req.params.id, req.body || {}, req.files || [], req.user))),
    listRendus: wrap(async (req, res) => res.json(await service.listRendus(req.params.id))),
    getRendu: wrap(async (req, res) => res.json(await service.getRendu(req.params.id))),
    addRenduImages: wrap(async (req, res) => res.status(201).json(await service.addRenduImages(req.params.id, req.body || {}, req.files || [], req.user))),
    patchRenduImage: wrap(async (req, res) => res.json(await service.patchRenduImage(req.params.id, req.params.imageId, req.body || {}))),
    deleteRenduImage: wrap(async (req, res) => { await service.deleteRenduImage(req.params.id, req.params.imageId); res.status(204).send(); }),
    patchRendu: wrap(async (req, res) => res.json(await service.patchRendu(req.params.id, req.body || {}))),
    deleteRendu: wrap(async (req, res) => { await service.deleteRendu(req.params.id); res.status(204).send(); })
  };
}

module.exports = { createTravauxController };