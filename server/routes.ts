import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, forms, variables, entries, documents } from "@db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { Parser } from 'json2csv';
import * as XLSX from 'xlsx';
import multer from 'multer';
import { createReport } from 'docx-templates';
import { promises as fs } from 'fs';
import mammoth from 'mammoth';
import { saveFile, readFile, deleteFile } from './storage';
import { Document, Paragraph, TextRun, Packer } from 'docx';

// Configurar multer para manejar archivos
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .doc, .docx y .txt'));
    }
  }
});

function ensureAuth(req: Request) {
  if (!req.isAuthenticated()) {
    throw new Error("Unauthorized");
  }
  return req.user!;
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Add toggle premium route at the top level
  app.post("/api/toggle-premium", async (req, res) => {
    try {
      const user = ensureAuth(req);

      // Update the user's premium status in the database
      const [updatedUser] = await db.update(users)
        .set({ isPremium: !user.isPremium })
        .where(eq(users.id, user.id))
        .returning();

      if (!updatedUser) {
        return res.status(500).json({ error: "Failed to update user status" });
      }

      // Update the session user object
      if (req.user) {
        req.user.isPremium = updatedUser.isPremium;
      }

      return res.json({
        success: true,
        isPremium: updatedUser.isPremium
      });

    } catch (error: any) {
      console.error('Error toggling premium status:', error);
      return res.status(500).json({
        error: "Error updating premium status",
        details: error.message
      });
    }
  });

  // Add document upload route
  app.post("/api/forms/:formId/documents/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No se ha proporcionado ningún archivo" });
      }

      let template: string;
      let preview: string;

      if (req.file.mimetype === 'text/plain') {
        template = req.file.buffer.toString('utf-8')
          .replace(/\0/g, '')
          .replace(/[^\x20-\x7E\x0A\x0D]/g, '');
        preview = template;
      } else {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        template = result.value;
        preview = template;
      }

      return res.json({
        name: req.file.originalname.split('.')[0],
        template,
        preview
      });

    } catch (error: any) {
      console.error('Error processing document:', error);
      return res.status(500).json({
        error: "Error al procesar el documento",
        details: error.message
      });
    }
  });

  // Agregar la ruta para crear documentos
  app.post("/api/forms/:formId/documents", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);
      const { name, template } = req.body;

      // Verificar que el formulario pertenece al usuario
      const [form] = await db.select()
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

      if (!form) {
        return res.status(404).json({ error: "Formulario no encontrado" });
      }

      // Guardar el documento
      const fileName = `${form.id}_${Date.now()}.docx`;
      const filePath = fileName;

      // Guardar el contenido del template
      await saveFile(filePath, Buffer.from(template));

      // Crear el registro del documento en la base de datos
      const [document] = await db.insert(documents)
        .values({
          formId: form.id,
          name,
          filePath,
        })
        .returning();

      return res.json(document);
    } catch (error: any) {
      console.error('Error al crear documento:', error);
      return res.status(500).json({
        error: "Error al crear el documento",
        details: error.message
      });
    }
  });

  // Add document preview download route
  app.get("/api/forms/:formId/documents/preview/download", async (req, res) => {
    try {
      const template = req.query.template as string;
      const filename = req.query.filename as string;

      if (!template || !filename) {
        return res.status(400).json({ error: "Template and filename are required" });
      }

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
      return res.send(template);

    } catch (error: any) {
      console.error('Error downloading preview:', error);
      return res.status(500).json({
        error: "Error al descargar la vista previa",
        details: error.message
      });
    }
  });

  // Document merge route
  app.post("/api/forms/:formId/documents/:documentId/merge", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);
      const documentId = parseInt(req.params.documentId);
      const entryId = parseInt(req.body.entryId);
      const isDownload = req.body.download === true;

      // Verificaciones de seguridad y existencia
      const [form] = await db.select()
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }

      const [doc] = await db.select()
        .from(documents)
        .where(and(eq(documents.id, documentId), eq(documents.formId, formId)));

      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      const [entry] = await db.select()
        .from(entries)
        .where(and(eq(entries.id, entryId), eq(entries.formId, formId)));

      if (!entry) {
        return res.status(404).json({ error: "Entry not found" });
      }

      const documentBuffer = await readFile(doc.filePath);
      const rawValues = entry.values || {};
      const mergeData: Record<string, string> = {};

      Object.entries(rawValues).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          mergeData[key] = String(value);
        } else {
          mergeData[key] = '';
        }
      });

      try {
        const mergedBuffer = await createReport({
          template: documentBuffer,
          data: mergeData,
          cmdDelimiter: ['{{', '}}'],
          failFast: false,
          rejectNullish: false,
          fixSmartQuotes: true,
          processLineBreaks: true,
          errorHandler: (error, cmdStr) => {
            console.error('Error en comando:', { error, cmdStr });
            return '';
          }
        });

        if (isDownload) {
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          res.setHeader('Content-Disposition', `attachment; filename="${doc.name}"`);
          return res.send(mergedBuffer);
        } else {
          // Mejorar la preservación del formato usando opciones avanzadas de mammoth
          const result = await mammoth.convertToHtml({
            buffer: mergedBuffer
          });

          const styledHtml = `
            <style>
              .document-preview {
                font-family: 'Calibri', sans-serif;
                line-height: 1.5;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background: white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.12);
              }
              .document-preview p {
                margin: 0;
                padding: 0.5em 0;
                white-space: pre-wrap;
              }
              .document-preview strong {
                font-weight: bold !important;
              }
              .document-preview em {
                font-style: italic !important;
              }
              .document-preview u {
                text-decoration: underline;
              }
              .document-preview .align-center {
                text-align: center;
              }
              .document-preview .align-right {
                text-align: right;
              }
              .document-preview .align-justify {
                text-align: justify;
              }
              .document-preview h1 {
                font-size: 24px;
                font-weight: bold;
                margin: 24px 0 12px;
              }
              .document-preview h2 {
                font-size: 20px;
                font-weight: bold;
                margin: 20px 0 10px;
              }
              .document-preview h3 {
                font-size: 16px;
                font-weight: bold;
                margin: 16px 0 8px;
              }
              .document-preview table {
                border-collapse: collapse;
                width: 100%;
                margin: 1em 0;
                page-break-inside: avoid;
              }
              .document-preview td, .document-preview th {
                border: 1px solid #ddd;
                padding: 8px;
                vertical-align: top;
              }
              .document-preview .list-paragraph {
                margin-left: 24px;
              }
              @media print {
                .document-preview {
                  box-shadow: none;
                  margin: 0;
                  padding: 0;
                }
              }
            </style>
            <div class="document-preview">${result.value}</div>`;

          return res.json({ result: styledHtml });
        }
      } catch (mergeError: any) {
        console.error('Error en el merge:', mergeError);
        return res.status(500).json({
          error: `Error en el proceso de merge: ${mergeError.message}`,
          details: mergeError.stack
        });
      }
    } catch (error: any) {
      console.error('Error general:', error);
      return res.status(500).json({
        error: `Error procesando el documento: ${error.message}`,
        details: error.stack
      });
    }
  });

  // Actualizar la ruta de creación de formularios
  app.post("/api/forms", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const { name, theme, variables: formVariables } = req.body;

      // Validar datos requeridos
      if (!name) {
        return res.status(400).json({ error: "El nombre del formulario es requerido" });
      }

      // Crear el formulario con sus variables en una transacción
      const result = await db.transaction(async (tx) => {
        // Crear el formulario
        const [form] = await tx.insert(forms)
          .values({
            userId: user.id,
            name,
            theme,
          })
          .returning();

        // Crear las variables si existen
        if (formVariables && Array.isArray(formVariables)) {
          for (const variable of formVariables) {
            await tx.insert(variables)
              .values({
                formId: form.id,
                name: variable.name,
                label: variable.label,
                type: variable.type || 'text',
              });
          }
        }

        return form;
      });

      return res.json(result);
    } catch (error: any) {
      console.error('Error creating form:', error);
      return res.status(500).json({
        error: "Error al crear el formulario",
        details: error.message
      });
    }
  });


  const httpServer = createServer(app);
  return httpServer;
}