
import express from 'express';
import { ensureAuth } from './auth';
import { variables } from '@db/schema';
import { eq } from 'drizzle-orm';

export function registerRoutes(app: express.Express) {
  app.patch("/api/forms/:formId/variables/:variableId", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);
      const variableId = req.params.variableId;

      await db
        .update(variables)
        .set({
          name: req.body.name,
          label: req.body.label,
          type: req.body.type,
          useRandomInitial: req.body.useRandomInitial,
          minValue: req.body.minValue,
          maxValue: req.body.maxValue
        })
        .where(eq(variables.id, variableId));

      res.sendStatus(200);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}
