const express = require('express');
const { TravauxRepository } = require('../backend/repositories/travaux.repository');
const { TravauxService } = require('../backend/services/travaux.service');
const { createTravauxController } = require('../backend/controllers/travaux.controller');

module.exports = function createTravauxRoutes(deps) {
  const { pool, authenticateToken, authorizeAdmin, renduUpload, assertAgentIsChef } = deps;
  const router = express.Router();

  const repository = new TravauxRepository(pool);
  const service = new TravauxService({ repository, assertAgentIsChef });
  const controller = createTravauxController(service);

  router.get('/travaux', authenticateToken, controller.list);
  router.get('/travaux/:id', authenticateToken, controller.getOne);
  router.post('/travaux', authenticateToken, authorizeAdmin, controller.create);
  router.put('/travaux/:id', authenticateToken, authorizeAdmin, controller.update);
  router.delete('/travaux/:id', authenticateToken, authorizeAdmin, controller.remove);

  router.get('/travaux/:travauxId/taches', authenticateToken, controller.listTaches);
  router.post('/travaux/:travauxId/taches', authenticateToken, authorizeAdmin, controller.createTache);
  router.get('/travaux_taches/:id', authenticateToken, controller.getTache);
  router.put('/travaux_taches/:id', authenticateToken, authorizeAdmin, controller.updateTache);
  router.delete('/travaux_taches/:id', authenticateToken, authorizeAdmin, controller.deleteTache);

  router.get('/travaux/:id/materiels', authenticateToken, controller.listMateriels);
  router.post('/travaux/:id/materiels', authenticateToken, authorizeAdmin, controller.createMateriel);
  router.patch('/travaux/:travauxId/materiels/:matId', authenticateToken, authorizeAdmin, controller.patchMateriel);
  router.delete('/travaux/:travauxId/materiels/:matId', authenticateToken, authorizeAdmin, controller.deleteMateriel);

  router.post('/travaux/:id/agents', authenticateToken, authorizeAdmin, controller.addAgent);
  router.delete('/travaux/:id/agents/:matricule', authenticateToken, authorizeAdmin, controller.removeAgent);

  router.post('/travaux/:id/responsables', authenticateToken, authorizeAdmin, controller.addResponsable);
  router.post('/travaux/:id/satisfaction', authenticateToken, controller.satisfaction);

  router.post('/travaux/:id/rendus', authenticateToken, authorizeAdmin, renduUpload.array('image_files[]'), controller.createRendu);
  router.get('/travaux/:id/rendus', authenticateToken, controller.listRendus);

  router.get('/rendu_travaux/:id', authenticateToken, controller.getRendu);
  router.post('/rendu_travaux/:id/images', authenticateToken, authorizeAdmin, renduUpload.array('image_files[]'), controller.addRenduImages);
  router.patch('/rendu_travaux/:id/images/:imageId', authenticateToken, authorizeAdmin, controller.patchRenduImage);
  router.delete('/rendu_travaux/:id/images/:imageId', authenticateToken, authorizeAdmin, controller.deleteRenduImage);
  router.patch('/rendu_travaux/:id', authenticateToken, authorizeAdmin, controller.patchRendu);
  router.delete('/rendu_travaux/:id', authenticateToken, authorizeAdmin, controller.deleteRendu);

  return router;
};