-- Create assignment tables for tickets and sites
CREATE TABLE IF NOT EXISTS ticket_agent (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  agent_matricule TEXT NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
  date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  date_fin TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ticket_agent_ticket ON ticket_agent(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_agent_agent ON ticket_agent(agent_matricule);

CREATE TABLE IF NOT EXISTS site_responsable (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  agent_matricule TEXT NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
  role TEXT DEFAULT 'Responsable',
  date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  date_fin TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_site_responsable_site ON site_responsable(site_id);
CREATE INDEX IF NOT EXISTS idx_site_responsable_agent ON site_responsable(agent_matricule);

CREATE TABLE IF NOT EXISTS site_agent (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  agent_matricule TEXT NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
  date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  date_fin TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_site_agent_site ON site_agent(site_id);
CREATE INDEX IF NOT EXISTS idx_site_agent_agent ON site_agent(agent_matricule);

