const { HttpError } = require('../services/messaging.service');

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError || (err && err.status && err.message)) {
        return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
      }
      console.error('messaging controller error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}

function createMessagingController(service) {
  return {
    createConversation: wrap(async (req, res) => res.status(201).json(await service.createConversation(req.user, req.body || {}))),
    listConversations: wrap(async (req, res) => res.json(await service.listConversations(req.user, req.query || {}))),
    getConversation: wrap(async (req, res) => res.json(await service.getConversation(req.params.conversation_id))),
    sendMessage: wrap(async (req, res) => res.status(201).json(await service.sendMessage(req.params.conversation_id, req.user, req.body || {}, req.files || [])))
  };
}

module.exports = { createMessagingController };