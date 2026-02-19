const { HttpError } = require('../services/tickets.service');

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError || (err && err.status && err.message)) {
        const code = err.status || 500;
        const payload = { error: err.message || 'Internal Server Error' };
        if (err.details) payload.details = err.details;
        return res.status(code).json(payload);
      }
      console.error('tickets controller error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}

function createTicketsController(service) {
  return {
    list: wrap(async (_req, res) => {
      res.json(await service.listTickets());
    }),

    getOne: wrap(async (req, res) => {
      res.json(await service.getTicket(req.params.id));
    }),

    getRelations: wrap(async (req, res) => {
      res.json(await service.getTicketRelations(req.params.id));
    }),

    create: wrap(async (req, res) => {
      const created = await service.createTicket(req.body || {}, req.user, req.headers || {});
      res.status(201).json(created);
    }),

    update: wrap(async (req, res) => {
      const updated = await service.updateTicket(req.params.id, req.body || {}, req.user);
      res.json(updated);
    }),

    remove: wrap(async (req, res) => {
      await service.deleteTicket(req.params.id, (req.body || {}).justification, req.user);
      res.status(204).send();
    }),

    take: wrap(async (req, res) => {
      const result = await service.takeTicket(req.params.id, req.body || {}, req.user, req.headers || {});
      res.status(result.status).json(result.payload);
    }),

    satisfaction: wrap(async (req, res) => {
      const data = await service.saveSatisfaction(req.params.id, (req.body || {}).note, (req.body || {}).commentaire, req.user);
      res.status(201).json(data);
    }),

    addAgent: wrap(async (req, res) => {
      const body = req.body || {};
      const data = await service.addAgent(req.params.id, body.agent_matricule, body.date_debut || null, body.date_fin || null);
      res.status(201).json(data);
    }),

    removeAgent: wrap(async (req, res) => {
      res.json(await service.removeAgent(req.params.id, req.params.matricule));
    }),

    addResponsable: wrap(async (req, res) => {
      const body = req.body || {};
      const data = await service.addResponsable(req.params.id, body.agent_matricule, body.role || 'Secondaire');
      res.status(201).json(data);
    }),

    removeResponsable: wrap(async (req, res) => {
      res.json(await service.removeResponsable(req.params.id, req.params.matricule));
    })
  };
}

module.exports = { createTicketsController };
