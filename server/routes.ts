import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { forms, variables, entries, documents } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { Parser } from 'json2csv';
import * as XLSX from 'xlsx';

function ensureAuth(req: Request) {
  if (!req.isAuthenticated()) {
    throw new Error("Unauthorized");
  }
  return req.user!;
}

function generatePreview(template: string, maxLength: number = 200): string {
  // Take first few lines, up to maxLength characters
  return template.slice(0, maxLength) + (template.length > maxLength ? '...' : '');
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

  app.get("/api/forms/:id", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.id);

    const form = await db.query.forms.findFirst({
      where: and(eq(forms.id, formId), eq(forms.userId, user.id)),
      with: {
        variables: true,
      },
    });

    if (!form) {
      return res.status(404).send("Form not found");
    }

    res.json(form);
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
  app.get("/api/forms/:formId/entries", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);

    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

    if (!form) {
      return res.status(404).send("Form not found");
    }

    const formEntries = await db.select()
      .from(entries)
      .where(eq(entries.formId, formId))
      .orderBy(desc(entries.createdAt));

    res.json(formEntries);
  });

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
  
    app.delete("/api/forms/:formId/entries/:entryId", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);
    const entryId = parseInt(req.params.entryId);

    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

    if (!form) {
      return res.status(404).send("Form not found");
    }

    // Verify entry exists and belongs to the form
    const [entry] = await db.select()
      .from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.formId, formId)));

    if (!entry) {
      return res.status(404).send("Entry not found");
    }

    await db.delete(entries)
      .where(and(eq(entries.id, entryId), eq(entries.formId, formId)));

    res.sendStatus(200);
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

    const preview = generatePreview(req.body.template);

    const [doc] = await db.insert(documents)
      .values({
        formId,
        name: req.body.name,
        template: req.body.template,
        preview,
      })
      .returning();

    res.status(201).json(doc);
  });

  app.get("/api/forms/:formId/documents", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);

    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

    if (!form) {
      return res.status(404).send("Form not found");
    }

    const docs = await db.select()
      .from(documents)
      .where(eq(documents.formId, formId));

    res.json(docs);
  });

    app.patch("/api/forms/:id", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.id);

    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

    if (!form) {
      return res.status(404).send("Form not found");
    }

    await db.update(forms)
      .set({ 
        name: req.body.name,
        updatedAt: new Date()
      })
      .where(eq(forms.id, formId));

    res.sendStatus(200);
  });
  
  app.patch("/api/forms/:formId/variables/:variableId", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);
    const variableId = parseInt(req.params.variableId);

    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

    if (!form) {
      return res.status(404).send("Form not found");
    }

    await db.update(variables)
      .set({ 
        name: req.body.name,
        label: req.body.label,
        type: req.body.type
      })
      .where(eq(variables.id, variableId));

    res.sendStatus(200);
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

  // Export entries endpoints
  app.get("/api/forms/:formId/entries/export", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);
    const format = req.query.format as string;

    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

    if (!form) {
      return res.status(404).send("Form not found");
    }

    // Get form entries with their variables
    const formData = await db.query.forms.findFirst({
      where: eq(forms.id, formId),
      with: {
        variables: true,
        entries: true,
      },
    });

    if (!formData) {
      return res.status(404).send("Form data not found");
    }

    const entries = formData.entries;
    const variables = formData.variables;

    switch (format) {
      case 'csv': {
        const fields = variables.map(v => ({
          label: v.label,
          value: (row: any) => row.values[v.name]
        }));
        fields.push({
          label: 'Fecha de Creación',
          value: 'createdAt'
        });

        const parser = new Parser({ fields });
        const csv = parser.parse(entries);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${form.name}-entries.csv`);
        return res.send(csv);
      }

      case 'excel': {
        const data = entries.map(entry => {
          const row: any = {
            'Fecha de Creación': entry.createdAt
          };
          variables.forEach(v => {
            row[v.label] = entry.values[v.name];
          });
          return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Entries');

        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${form.name}-entries.xlsx`);
        return res.send(Buffer.from(excelBuffer));
      }

      case 'json': {
        const data = entries.map(entry => {
          const row: any = {
            createdAt: entry.createdAt
          };
          variables.forEach(v => {
            row[v.name] = entry.values[v.name];
          });
          return row;
        });

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${form.name}-entries.json`);
        return res.json(data);
      }

      default:
        return res.status(400).send("Formato no soportado");
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}