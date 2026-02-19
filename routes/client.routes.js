const express = require('express');
const { ClientRepository } = require('../backend/repositories/client.repository');
const { ClientService } = require('../backend/services/client.service');
const { createClientController } = require('../backend/controllers/client.controller');

module.exports = function createClientRoutes(deps) {
  const {
    pool,
    authenticateToken,
    authorizeAdmin,
    bcrypt,
    getClientIdsForUser,
    userOwnsClientId,
    logAudit
  } = deps;

  const router = express.Router();
  const repository = new ClientRepository(pool);
  const service = new ClientService({ repository, bcrypt, getClientIdsForUser, userOwnsClientId, logAudit });
  const controller = createClientController(service);

  router.post('/clients/register', authenticateToken, authorizeAdmin, controller.registerClient);

  router.get('/client/profile', authenticateToken, controller.getProfile);
  router.get('/client/sites', authenticateToken, controller.listSites);
  router.post('/client/sites', authenticateToken, controller.createSite);
  router.get('/client/sites/:id', authenticateToken, controller.getSite);
  router.get('/client/sites/:id/relations', authenticateToken, controller.getSiteRelations);
  router.put('/client/sites/:id', authenticateToken, controller.updateSite);

  router.get('/demandes_client/mine', authenticateToken, controller.listMyDemandes);
  router.get('/demandes_client/:id', authenticateToken, controller.getDemande);
  router.get('/demandes_client/:id/relations', authenticateToken, controller.getDemandeRelations);
  router.post('/demandes_client', authenticateToken, controller.createDemande);
  router.put('/demandes_client/:id', authenticateToken, controller.updateDemande);
  router.get('/client/demandes/:id', authenticateToken, controller.getClientDemandeDetails);

  router.post('/demandes-client/:demandeId/travaux', authenticateToken, authorizeAdmin, controller.linkDemandeTravaux);
  router.delete('/demandes-client-travaux/:id', authenticateToken, authorizeAdmin, controller.unlinkDemandeTravaux);

  router.get('/demandes_client', authenticateToken, authorizeAdmin, controller.listDemandesAdmin);
  router.put('/demandes_client/:id/status', authenticateToken, authorizeAdmin, controller.updateDemandeStatus);
  router.delete('/demandes_client/:id', authenticateToken, authorizeAdmin, controller.deleteDemande);
  router.get('/demandes_client/deleted', authenticateToken, authorizeAdmin, controller.listDeletedDemandes);
  router.post('/demandes_client/:id/restore', authenticateToken, authorizeAdmin, controller.restoreDemande);
  router.post('/demandes_client/:id/convert-to-ticket', authenticateToken, authorizeAdmin, controller.convertToTicket);

  return router;
};