const express = require('express');
const { MessagingRepository } = require('../backend/repositories/messaging.repository');
const { MessagingService } = require('../backend/services/messaging.service');
const { createMessagingController } = require('../backend/controllers/messaging.controller');

module.exports = function createMessagingRoutes(deps) {
  const { pool, authenticateToken, upload } = deps;
  const router = express.Router();

  const repository = new MessagingRepository(pool);
  const service = new MessagingService({ repository });
  const controller = createMessagingController(service);

  router.post('/conversations/new', authenticateToken, controller.createConversation);
  router.get('/conversations', authenticateToken, controller.listConversations);
  router.get('/conversations/:conversation_id', authenticateToken, controller.getConversation);
  router.post('/conversations/:conversation_id/messages', authenticateToken, upload.array('attachments'), controller.sendMessage);

  return router;
};