import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { forms, variables, entries, documents } from "@db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { Parser } from 'json2csv';
import * as XLSX from 'xlsx';
import multer from 'multer';
import { createReport } from 'docx-templates';
import { promises as fs } from 'fs';
import mammoth from 'mammoth';

// Configurar multer para manejar archivos
const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .doc y .docx'));
    }
  }
});

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

  // Add new toggle premium route
  app.post("/api/toggle-premium", async (req, res) => {
    const user = ensureAuth(req);

    const [updatedUser] = await db.update(users)
      .set({ isPremium: !user.isPremium })
      .where(eq(users.id, user.id))
      .returning();

    req.user = updatedUser;
    res.json(updatedUser);
  });

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
        variables: {
          orderBy: [asc(variables.id)],
        },
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
        theme: req.body.theme || { primary: "#64748b", variant: "default" }
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

    // Accept any values object, even if incomplete
    const [entry] = await db.insert(entries)
      .values({
        formId,
        values: req.body.values || {}, // Allow empty object if no values provided
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
  app.post("/api/forms/:formId/documents/upload", upload.single('file'), async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = req.params.formId === 'temp' ? null : parseInt(req.params.formId);
      const file = req.file;

      if (!file) {
        return res.status(400).send("No se ha proporcionado ningún archivo");
      }

      if (formId !== null) {
        const [form] = await db.select()
          .from(forms)
          .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

        if (!form) {
          return res.status(404).send("Form not found");
        }
      }

      try {
        // Guardar el documento original como base64 para preservar el formato binario
        const originalDocBase64 = file.buffer.toString('base64');

        // Convertir el documento a HTML para preview manteniendo el formato
        const [htmlResult, textResult] = await Promise.all([
          mammoth.convertToHtml({ 
            buffer: file.buffer,
            options: {
              styleMap: [
                "p[style-name='Heading 1'] => h1:fresh",
                "p[style-name='Heading 2'] => h2:fresh",
                "p[style-name='Heading 3'] => h3:fresh",
                "r[style-name='Strong'] => strong",
                "r[style-name='Emphasis'] => em",
                "table => table",
                "p => p",
                "br => br"
              ]
            }
          }),
          mammoth.extractRawText({ buffer: file.buffer })
        ]);

        // Si es una carga temporal, solo devolver el contenido
        if (formId === null) {
          return res.status(200).json({
            name: file.originalname.replace(/\.[^/.]+$/, ""),
            template: textResult.value,
            preview: htmlResult.value
          });
        }

        // Guardar en la base de datos con el documento original en base64
        const [doc] = await db.insert(documents)
          .values({
            formId,
            name: file.originalname.replace(/\.[^/.]+$/, ""),
            template: textResult.value,
            preview: htmlResult.value,
            originalDocument: originalDocBase64 // Guardar como base64
          })
          .returning();

        res.status(201).json(doc);
      } catch (error: any) {
        console.error('Error processing document:', error);
        return res.status(400).send(`Error al procesar el documento: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error in document upload:', error);
      res.status(500).send(`Error al subir el documento: ${error.message}`);
    }
});

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

  app.delete("/api/forms/:formId/documents/:documentId", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);
    const documentId = parseInt(req.params.documentId);

    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

    if (!form) {
      return res.status(404).send("Form not found");
    }

    // Verify document exists and belongs to the form
    const [doc] = await db.select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.formId, formId)));

    if (!doc) {
      return res.status(404).send("Document not found");
    }

    await db.delete(documents)
      .where(and(eq(documents.id, documentId), eq(documents.formId, formId)));

    res.sendStatus(200);
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

    const [updatedForm] = await db.update(forms)
      .set({ 
        name: req.body.name,
        theme: req.body.theme || form.theme,
        updatedAt: new Date()
      })
      .where(eq(forms.id, formId))
      .returning();

    res.json(updatedForm);
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

  app.post("/api/forms/:formId/documents/:documentId/merge", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);
    const documentId = parseInt(req.params.documentId);
    const entryId = parseInt(req.body.entryId);
    const isDownload = req.body.download === true;

    try {
      // Verificaciones de seguridad y existencia
      const [form] = await db.select()
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

      if (!form) {
        return res.status(404).send("Form not found");
      }

      console.log(`Buscando documento ${documentId} del formulario ${formId}`);
      const [doc] = await db.select()
        .from(documents)
        .where(and(
          eq(documents.id, documentId),
          eq(documents.formId, formId)
        ));

      if (!doc) {
        return res.status(404).send("Document not found");
      }

      console.log('Documento encontrado:', {
        id: doc.id,
        formId: doc.formId,
        name: doc.name,
        hasOriginalDoc: !!doc.originalDocument,
        originalDocLength: doc.originalDocument ? doc.originalDocument.length : 0
      });

      const [entry] = await db.select()
        .from(entries)
        .where(and(
          eq(entries.id, entryId),
          eq(entries.formId, formId)
        ));

      if (!entry) {
        return res.status(404).send("Entry not found");
      }

      if (!doc.originalDocument) {
        console.error('No se encontró el documento original en la base de datos');
        return res.status(400).send("No se encontró el documento original");
      }

      try {
        console.log('Processing document merge in DOCX format');

        // Verificar que el documento original es un string base64 válido
        if (!doc.originalDocument.match(/^[A-Za-z0-9+/=]+$/)) {
          console.error('El documento original no está en formato base64 válido');
          return res.status(400).send("El formato del documento original no es válido");
        }

        // Convertir el documento de base64 a buffer
        const originalDocBuffer = Buffer.from(doc.originalDocument, 'base64');
        console.log('Buffer creado correctamente, tamaño:', originalDocBuffer.length);

        // Crear el documento fusionado manteniendo el formato DOCX
        const mergedBuffer = await createReport({
          template: originalDocBuffer,
          data: entry.values || {},
          cmdDelimiter: ['{{', '}}'],
          failFast: false,
          rejectNullish: false,
          fixSmartQuotes: true,
          processLineBreaks: true
        });

        if (isDownload) {
          // Para descarga, enviar el documento DOCX directamente
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          res.setHeader('Content-Disposition', `attachment; filename="${doc.name}.docx"`);
          return res.send(mergedBuffer);
        } else {
          // Para vista previa, convertir el documento fusionado a HTML manteniendo el formato
          const result = await mammoth.convertToHtml({
            buffer: mergedBuffer,
            options: {
              styleMap: [
                "p[style-name='Heading 1'] => h1:fresh",
                "p[style-name='Heading 2'] => h2:fresh",
                "p[style-name='Heading 3'] => h3:fresh",
                "r[style-name='Strong'] => strong",
                "r[style-name='Emphasis'] => em",
                "table => table",
                "p => p",
                "br => br"
              ]
            }
          });

          return res.json({ 
            result: `<div class="document-preview">${result.value}</div>` 
          });
        }
      } catch (error: any) {
        console.error('Error in document processing:', error);
        return res.status(500).send(`Error procesando el documento: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error in merge operation:', error);
      res.status(500).send("Error al procesar la solicitud de merge");
    }
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
  
  app.patch("/api/forms/:formId/entries/:entryId", async (req, res) => {
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

    // Update existing entry
    const [entry] = await db.update(entries)
      .set({
        values: req.body,
      })
      .where(and(
        eq(entries.id, entryId),
        eq(entries.formId, formId)
      ))
      .returning();

    if (!entry) {
      return res.status(404).send("Entry not found");
    }

    res.json(entry);
  });

    app.delete("/api/forms/:id", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.id);
  
      try {
        // Verify ownership
        const [form] = await db.select()
          .from(forms)
          .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));
  
        if (!form) {
          return res.status(404).send("Form not found");
        }
  
        // Delete all related records first
        await db.transaction(async (tx) => {
          // Delete entries
          await tx.delete(entries)
            .where(eq(entries.formId, formId));
  
          // Delete variables
          await tx.delete(variables)
            .where(eq(variables.formId, formId));
  
          // Delete documents
          await tx.delete(documents)
            .where(eq(documents.formId, formId));
  
          // Finally delete the form
          await tx.delete(forms)
            .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));
        });
  
        res.sendStatus(200);
      } catch (error) {
        console.error('Error deleting form:', error);
        res.status(500).send("Error deleting form");
      }
  });

  // Add new route for document preview download
  app.get("/api/forms/:formId/documents/preview/download", async (req, res) => {
    try {
      const template = req.query.template as string;
      const filename = req.query.filename as string;

      if (!template || !filename) {
        return res.status(400).send("Template and filename are required");
      }

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
      res.send(template);
    } catch (error) {
      console.error('Error downloading preview:', error);
      res.status(500).send("Error al descargar la vista previa");
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}