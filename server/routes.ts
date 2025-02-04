
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

      const updateData: any = {
        name: req.body.name,
        label: req.body.label,
        type: req.body.type,
        useRandomInitial: req.body.useRandomInitial === true
      };

      if (req.body.type === 'number') {
        updateData.minValue = req.body.useRandomInitial ? req.body.minValue?.toString() : null;
        updateData.maxValue = req.body.useRandomInitial ? req.body.maxValue?.toString() : null;
      }

      await db
        .update(variables)
        .set(updateData)
        .where(eq(variables.id, variableId));

      res.sendStatus(200);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}
