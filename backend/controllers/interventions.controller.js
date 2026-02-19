const { HttpError } = require('../services/interventions.service');

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError || (err && err.status && err.message)) {
        return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
      }
      console.error('interventions controller error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}

function createInterventionsController(service) {
  return {
    list: wrap(async (req, res) => res.json(await service.list(req.query || {}))),
    getEvents: wrap(async (req, res) => res.json(await service.getEvents(req.params.id))),
    syncEvents: wrap(async (req, res) => res.json(await service.syncEvents(req.params.id))),
    getOne: wrap(async (req, res) => res.json(await service.getOne(req.params.id))),
    getCalendar: wrap(async (req, res) => res.json(await service.getCalendar(req.query || {}))),
    getRelations: wrap(async (req, res) => res.json(await service.getRelations(req.params.id))),
    addMateriel: wrap(async (req, res) => res.status(201).json(await service.addMateriel(req.params.id, req.body || {}))),
    listMateriels: wrap(async (req, res) => res.json(await service.listMateriels(req.params.id))),
    create: wrap(async (req, res) => res.status(201).json(await service.create(req.body || {}))),
    update: wrap(async (req, res) => res.json(await service.update(req.params.id, req.body || {}))),
    patch: wrap(async (req, res) => res.json(await service.patch(req.params.id, req.body || {}))),
    remove: wrap(async (req, res) => { await service.remove(req.params.id); res.status(204).send(); }),
    createRendu: wrap(async (req, res) => res.status(201).json(await service.createRendu(req.params.id, req.body || {}, req.files || [], req.user))),
    listRendus: wrap(async (req, res) => res.json(await service.listRendus(req.params.id))),
    getRendu: wrap(async (req, res) => res.json(await service.getRendu(req.params.id))),
    patchRendu: wrap(async (req, res) => res.json(await service.patchRendu(req.params.id, req.body || {}, req.user))),
    deleteRendu: wrap(async (req, res) => { await service.deleteRendu(req.params.id); res.status(204).send(); })
  };
}

module.exports = { createInterventionsController };
