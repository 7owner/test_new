const express = require('express');
const { TicketsRepository } = require('../backend/repositories/tickets.repository');
const { TicketsService } = require('../backend/services/tickets.service');
const { createTicketsController } = require('../backend/controllers/tickets.controller');

module.exports = function createTicketsRoutes(deps) {
  const { pool, authenticateToken, authorizeAdmin, logAudit, assertAgentIsChef } = deps;
  const router = express.Router();

  const repository = new TicketsRepository(pool);
  const service = new TicketsService({ repository, logAudit, assertAgentIsChef });
  const controller = createTicketsController(service);

  router.get('/tickets', authenticateToken, controller.list);
  router.get('/tickets/:id', authenticateToken, controller.getOne);
  router.get('/tickets/:id/relations', authenticateToken, controller.getRelations);

  router.post('/tickets', authenticateToken, authorizeAdmin, controller.create);
  router.put('/tickets/:id', authenticateToken, authorizeAdmin, controller.update);
  router.delete('/tickets/:id', authenticateToken, authorizeAdmin, controller.remove);

  router.post('/tickets/:id/take', authenticateToken, authorizeAdmin, controller.take);
  router.post('/tickets/:id/satisfaction', authenticateToken, controller.satisfaction);

  router.post('/tickets/:id/agents', authenticateToken, authorizeAdmin, controller.addAgent);
  router.delete('/tickets/:id/agents/:matricule', authenticateToken, authorizeAdmin, controller.removeAgent);

  router.post('/tickets/:id/responsables', authenticateToken, authorizeAdmin, controller.addResponsable);
  router.delete('/tickets/:id/responsables/:matricule', authenticateToken, authorizeAdmin, controller.removeResponsable);

  return router;
};
