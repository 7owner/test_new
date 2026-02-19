const { HttpError } = require('../services/client.service');

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError || (err && err.status && err.message)) {
        return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
      }
      console.error('client controller error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}

function createClientController(service) {
  return {
    registerClient: wrap(async (req, res) => res.status(201).json(await service.registerClient(req.body || {}))),
    getProfile: wrap(async (req, res) => res.json(await service.getProfile(req.user))),
    listSites: wrap(async (req, res) => res.json(await service.listSites(req.user))),
    createSite: wrap(async (req, res) => res.status(201).json(await service.createSite(req.user, req.body || {}))),
    getSite: wrap(async (req, res) => res.json(await service.getSite(req.user, req.params.id))),
    getSiteRelations: wrap(async (req, res) => res.json(await service.getSiteRelations(req.user, req.params.id))),
    updateSite: wrap(async (req, res) => res.json(await service.updateSite(req.user, req.params.id, req.body || {}))),

    listMyDemandes: wrap(async (req, res) => res.json(await service.listMyDemandes(req.user))),
    getDemande: wrap(async (req, res) => res.status(200).json(await service.getDemande(req.user, req.params.id))),
    getDemandeRelations: wrap(async (req, res) => res.json(await service.getDemandeRelations(req.user, req.params.id))),
    createDemande: wrap(async (req, res) => res.status(201).json(await service.createDemande(req.user, req.body || {}))),
    updateDemande: wrap(async (req, res) => res.status(200).json(await service.updateDemande(req.user, req.params.id, req.body || {}))),
    getClientDemandeDetails: wrap(async (req, res) => res.json(await service.getClientDemandeDetails(req.user, req.params.id))),

    linkDemandeTravaux: wrap(async (req, res) => res.status(201).json(await service.linkDemandeTravaux(req.params.demandeId, (req.body || {}).travaux_id))),
    unlinkDemandeTravaux: wrap(async (req, res) => res.json(await service.unlinkDemandeTravaux(req.params.id))),

    listDemandesAdmin: wrap(async (req, res) => res.json(await service.listDemandesAdmin(req.query || {}))),
    updateDemandeStatus: wrap(async (req, res) => res.json(await service.updateDemandeStatus(req.params.id, req.body || {}))),
    deleteDemande: wrap(async (req, res) => res.status(200).json(await service.deleteDemande(req.params.id, (req.body || {}).justification, req.user))),
    listDeletedDemandes: wrap(async (_req, res) => res.json(await service.listDeletedDemandes())),
    restoreDemande: wrap(async (req, res) => res.json(await service.restoreDemande(req.params.id))),
    convertToTicket: wrap(async (req, res) => res.status(201).json(await service.convertToTicket(req.params.id, req.user)))
  };
}

module.exports = { createClientController };