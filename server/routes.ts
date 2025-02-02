import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, forms, variables, entries, documents } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import multer from 'multer';
import { createReport } from 'docx-templates';
import { promises as fs } from 'fs';
import mammoth from 'mammoth';
import { saveFile, readFile, deleteFile, fileExists } from './storage';
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

  // Delete form route
  app.delete("/api/forms/:formId", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);

      // Verify form ownership
      const [form] = await db.select()
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }

      // Delete form and related data
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

        // Delete form
        await tx.delete(forms)
          .where(eq(forms.id, formId));
      });

      return res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting form:', error);
      return res.status(500).json({
        error: "Error deleting form",
        details: error.message
      });
    }
  });
  
  // Agregar la ruta GET /api/forms al inicio
  app.get("/api/forms", async (req, res) => {
    try {
      const user = ensureAuth(req);

      const userForms = await db.query.forms.findMany({
        where: eq(forms.userId, user.id),
        with: {
          variables: true
        },
        orderBy: desc(forms.id)
      });

      return res.json(userForms);
    } catch (error: any) {
      console.error('Error fetching forms:', error);
      return res.status(500).json({
        error: "Error al obtener los formularios",
        details: error.message
      });
    }
  });

  // Agregar la ruta para obtener un formulario específico
  app.get("/api/forms/:formId", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);

      const form = await db.query.forms.findFirst({
        where: and(eq(forms.id, formId), eq(forms.userId, user.id)),
        with: {
          variables: true
        }
      });

      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }

      return res.json(form);
    } catch (error: any) {
      console.error('Error fetching form:', error);
      return res.status(500).json({
        error: "Error al obtener el formulario",
        details: error.message
      });
    }
  });

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

  app.post("/api/forms/temp/documents/upload", upload.single('file'), async (req, res) => {
    try {
      console.log('Processing document upload request');

      if (!req.file) {
        return res.status(400).json({ error: "No se ha proporcionado ningún archivo" });
      }

      console.log('File received:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer ? 'Buffer present' : 'No buffer'
      });

      // Validate MIME type
      const allowedMimeTypes = {
        'text/plain': '.txt',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
      };

      if (!allowedMimeTypes[req.file.mimetype]) {
        return res.status(400).json({ 
          error: "Tipo de archivo no permitido",
          details: `Solo se permiten archivos: ${Object.values(allowedMimeTypes).join(', ')}`
        });
      }

      // Generate a unique filename preserving the original extension
      const fileExtension = allowedMimeTypes[req.file.mimetype];
      const originalFileName = `temp_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      console.log('Generated original filename:', originalFileName);

      try {
        // Save the original file
        await saveFile(originalFileName, req.file.buffer);
        console.log('Original file saved successfully');
      } catch (saveError) {
        console.error('Error saving original file:', saveError);
        throw new Error(`Error al guardar el archivo original: ${saveError.message}`);
      }

      let template: string;
      let preview: string;

      if (req.file.mimetype === 'text/plain') {
        console.log('Processing text file');
        template = req.file.buffer.toString('utf-8')
          .replace(/\0/g, '')
          .replace(/[^\x20-\x7E\x0A\x0D]/g, '');
        preview = template;
      } else {
        console.log('Processing DOCX file');
        try {
          // Para archivos DOCX, extraer texto solo para la vista previa
          const result = await mammoth.extractRawText({ buffer: req.file.buffer });
          preview = result.value;
          template = preview; // Guardamos el texto extraído como plantilla
          console.log('DOCX preview extracted successfully');
        } catch (extractError) {
          console.error('Error extracting preview from DOCX:', extractError);
          throw new Error(`Error al procesar el archivo DOCX: ${extractError.message}`);
        }
      }

      const response = {
        name: req.file.originalname.split('.')[0],
        template,
        preview,
        originalFile: originalFileName,
        originalMimeType: req.file.mimetype
      };

      console.log('Sending response:', {
        name: response.name,
        templateLength: response.template?.length,
        previewLength: response.preview?.length,
        originalFile: response.originalFile,
        mimeType: response.originalMimeType
      });

      return res.json(response);

    } catch (error: any) {
      console.error('Error processing document:', error);
      return res.status(500).json({
        error: "Error al procesar el documento",
        details: error.message
      });
    }
  });

  // Modificar la ruta para crear documentos
  app.post("/api/forms/:formId/documents", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);
      const { name, template, originalFile, originalMimeType } = req.body;

      if (!name || !template) {
        return res.status(400).json({ error: "Nombre y plantilla son requeridos" });
      }

      // Verificar que el formulario pertenece al usuario
      const [form] = await db.select()
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

      if (!form) {
        return res.status(404).json({ error: "Formulario no encontrado" });
      }

      console.log('Creating document for form:', { formId, name, hasOriginalFile: !!originalFile });

      // Generar nombre de archivo único para el nuevo documento
      const newFileName = `form_${formId}_${Date.now()}.docx`;

      try {
        let finalBuffer: Buffer;

        if (originalFile) {
          console.log('Checking original file:', originalFile);
          const exists = await fileExists(originalFile);

          if (!exists) {
            throw new Error(`Original file not found: ${originalFile}`);
          }

          console.log('Original file exists, reading content');
          const fileContent = await readFile(originalFile);
          finalBuffer = Buffer.from(fileContent); // Asegurar que tenemos un Buffer válido
          console.log('Original file content read successfully');
        } else {
          console.log('Creating new document from template');
          const doc = new Document({
            sections: [{
              properties: {},
              children: [
                new Paragraph({
                  children: [new TextRun({ text: template })]
                })
              ]
            }]
          });

          finalBuffer = await Packer.toBuffer(doc);
          console.log('New document created from template');
        }

        // Guardar el nuevo archivo
        console.log('Saving new document as:', newFileName);
        await saveFile(newFileName, finalBuffer);
        console.log('New document saved successfully');

        // Si había un archivo original, eliminarlo
        if (originalFile) {
          try {
            await deleteFile(originalFile);
            console.log('Original file cleaned up');
          } catch (cleanupError) {
            console.error('Error cleaning up original file:', cleanupError);
            // Continuar incluso si falla la limpieza
          }
        }

        // Crear el registro en la base de datos
        const [document] = await db
          .insert(documents)
          .values({
            formId,
            name,
            template,
            filePath: newFileName,
            mimeType: originalMimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          })
          .returning();

        console.log('Document record created:', document);
        return res.json(document);

      } catch (fileError: any) {
        console.error('Error handling document file:', fileError);
        throw new Error(`Error processing document file: ${fileError.message}`);
      }

    } catch (error: any) {
      console.error('Error creating document:', error);
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
          await tx.insert(variables)
            .values(
              formVariables.map(variable => ({
                formId: form.id,
                name: variable.name,
                label: variable.label,
                type: variable.type || 'text',
              }))
            );
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
  
  // Add entries routes after form routes
  app.post("/api/forms/:formId/entries", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);
      const { values } = req.body;

      // Verificar que el formulario pertenece al usuario
      const [form] = await db.select()
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

      if (!form) {
        return res.status(404).json({ error: "Formulario no encontrado" });
      }

      // Crear la entrada
      const [entry] = await db.insert(entries)
        .values({
          formId: form.id,
          values,
          createdAt: new Date()
        })
        .returning();

      return res.json(entry);
    } catch (error: any) {
      console.error('Error creating entry:', error);
      return res.status(500).json({
        error: "Error al crear la entrada",
        details: error.message
      });
    }
  });

  // Get entries for a form
  app.get("/api/forms/:formId/entries", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);

      // Verificar que el formulario pertenece al usuario
      const [form] = await db.select()
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

      if (!form) {
        return res.status(404).json({ error: "Formulario no encontrado" });
      }

      // Obtener las entradas del formulario
      const formEntries = await db.select()
        .from(entries)
        .where(eq(entries.formId, formId))
        .orderBy(desc(entries.createdAt));

      return res.json(formEntries);
    } catch (error: any) {
      console.error('Error fetching entries:', error);
      return res.status(500).json({
        error: "Error al obtener las entradas",
        details: error.message
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}