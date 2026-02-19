const express = require('express');
const { InterventionsRepository } = require('../backend/repositories/interventions.repository');
const { InterventionsService } = require('../backend/services/interventions.service');
const { createInterventionsController } = require('../backend/controllers/interventions.controller');

module.exports = function createInterventionsRoutes(deps) {
  const { pool, authenticateToken, authorizeAdmin, renduUpload, syncInterventionEvents } = deps;
  const router = express.Router();

  const repository = new InterventionsRepository(pool);
  const service = new InterventionsService({ repository, syncInterventionEvents });
  const controller = createInterventionsController(service);

  router.get('/interventions', authenticateToken, controller.list);
  router.get('/interventions/:id/events', authenticateToken, controller.getEvents);
  router.post('/interventions/:id/events/sync', authenticateToken, authorizeAdmin, controller.syncEvents);
  router.get('/interventions/:id', authenticateToken, controller.getOne);
  router.get('/interventions/calendar', authenticateToken, controller.getCalendar);
  router.get('/interventions/:id/relations', authenticateToken, controller.getRelations);
  router.post('/interventions/:id/materiels', authenticateToken, authorizeAdmin, controller.addMateriel);
  router.get('/interventions/:id/materiels', authenticateToken, controller.listMateriels);

  router.post('/interventions', authenticateToken, authorizeAdmin, controller.create);
  router.put('/interventions/:id', authenticateToken, authorizeAdmin, controller.update);
  router.patch('/interventions/:id', authenticateToken, authorizeAdmin, controller.patch);
  router.delete('/interventions/:id', authenticateToken, authorizeAdmin, controller.remove);

  router.post('/interventions/:id/rendus', authenticateToken, authorizeAdmin, renduUpload.array('image_files[]'), controller.createRendu);
  router.get('/interventions/:id/rendus', authenticateToken, controller.listRendus);
  router.get('/rendus/:id', authenticateToken, controller.getRendu);
  router.patch('/rendus/:id', authenticateToken, controller.patchRendu);
  router.delete('/rendus/:id', authenticateToken, authorizeAdmin, controller.deleteRendu);

  return router;
};
