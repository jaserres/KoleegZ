import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { forms, variables, entries, documents } from "@db/schema";
import { eq, and } from "drizzle-orm";

function ensureAuth(req: Request) {
  if (!req.isAuthenticated()) {
    throw new Error("Unauthorized");
  }
  return req.user!;
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Form endpoints
  app.get("/api/forms", async (req, res) => {
    const user = ensureAuth(req);
    const userForms = await db.query.forms.findMany({
      where: eq(forms.userId, user.id),
      with: {
        variables: true,
      },
    });
    res.json(userForms);
  });

  app.post("/api/forms", async (req, res) => {
    const user = ensureAuth(req);
    
    // Check limits
    const formCount = await db.select().from(forms).where(eq(forms.userId, user.id));
    const limit = user.isPremium ? 10 : 1;
    
    if (formCount.length >= limit) {
      return res.status(403).send(`Free users can only create ${limit} forms`);
    }

    const [form] = await db.insert(forms)
      .values({
        userId: user.id,
        name: req.body.name,
      })
      .returning();

    res.status(201).json(form);
  });

  // Variables endpoints
  app.post("/api/forms/:formId/variables", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);
    
    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));
      
    if (!form) {
      return res.status(404).send("Form not found");
    }

    // Check variable limit
    const varCount = await db.select()
      .from(variables)
      .where(eq(variables.formId, formId));
    
    const limit = user.isPremium ? 50 : 10;
    if (varCount.length >= limit) {
      return res.status(403).send(`You can only create ${limit} variables per form`);
    }

    const [variable] = await db.insert(variables)
      .values({
        formId,
        name: req.body.name,
        label: req.body.label,
        type: req.body.type,
      })
      .returning();

    res.status(201).json(variable);
  });

  // Entries endpoints
  app.post("/api/forms/:formId/entries", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);

    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));
      
    if (!form) {
      return res.status(404).send("Form not found");
    }

    // Check entry limit
    const entryCount = await db.select()
      .from(entries)
      .where(eq(entries.formId, formId));
    
    const limit = user.isPremium ? 100 : 5;
    if (entryCount.length >= limit) {
      return res.status(403).send(`You can only create ${limit} entries per form`);
    }

    const [entry] = await db.insert(entries)
      .values({
        formId,
        values: req.body.values,
      })
      .returning();

    res.status(201).json(entry);
  });

  // Documents endpoints
  app.post("/api/forms/:formId/documents", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);

    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));
      
    if (!form) {
      return res.status(404).send("Form not found");
    }

    const [doc] = await db.insert(documents)
      .values({
        formId,
        name: req.body.name,
        template: req.body.template,
      })
      .returning();

    res.status(201).json(doc);
  });

  // Mail merge endpoint
  app.post("/api/forms/:formId/documents/:documentId/merge", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);
    const documentId = parseInt(req.params.documentId);

    // Verify ownership
    const [doc] = await db.select()
      .from(documents)
      .where(and(
        eq(documents.id, documentId),
        eq(documents.formId, formId)
      ));

    if (!doc) {
      return res.status(404).send("Document not found");
    }

    const entryId = req.body.entryId;
    const [entry] = await db.select()
      .from(entries)
      .where(and(
        eq(entries.id, entryId),
        eq(entries.formId, formId)
      ));

    if (!entry) {
      return res.status(404).send("Entry not found");
    }

    // Perform mail merge
    let result = doc.template;
    for (const [key, value] of Object.entries(entry.values)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }

    res.json({ result });
  });

  const httpServer = createServer(app);
  return httpServer;
}
