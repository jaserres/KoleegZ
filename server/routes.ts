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
import { saveFile, readFile, deleteFile } from './storage';
import { Document, Paragraph, TextRun, Packer } from 'docx';
import { Buffer } from 'buffer';

// Configurar multer para manejar archivos
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // Aceptar cualquier tipo de documento de Word
    if (file.mimetype.includes('word') || 
        file.originalname.toLowerCase().endsWith('.doc') || 
        file.originalname.toLowerCase().endsWith('.docx')) {
      cb(null, true);
    } else {
      cb(new Error('Por favor sube un documento de Word (.doc o .docx)'));
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
        console.error('No se proporcionó archivo');
        return res.status(400).json({
          error: "No se ha proporcionado ningún archivo"
        });
      }

      console.log('Archivo recibido:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });

      if (formId !== null) {
        // Verify ownership
        const [form] = await db.select()
          .from(forms)
          .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

        if (!form) {
          console.error('Formulario no encontrado:', { formId });
          return res.status(404).json({
            error: "Form not found",
            formId
          });
        }
      }

      let template = '';
      let preview = '';
      let filePath = '';

      try {
        console.log('Procesando documento Word...');

        // Asegurar que tenemos un buffer válido
        const validBuffer = Buffer.from(file.buffer);

        // Guardar el archivo original
        filePath = await saveFile(validBuffer, file.originalname);

        // Extraer el contenido preservando el formato
        const htmlResult = await mammoth.convertToHtml(
          { buffer: validBuffer },
          {
            styleMap: [
              "p[style-name='Normal'] => p:fresh",
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='List Paragraph'] => p.list-paragraph:fresh",
              "r[style-name='Strong'] => strong",
              "r[style-name='Emphasis'] => em",
              "r[style-name='style1'] => strong",
              "r[style-name='style2'] => em",
              "b => strong",
              "i => em",
              "u => u",
              "strike => s",
              "tab => span.tab",
              "br => br",
              "table => table",
              "tr => tr",
              "td => td",
              "p[style-name='Footer'] => div.footer > p:fresh",
              "p[style-name='Header'] => div.header > p:fresh"
            ],
            includeDefaultStyleMap: true,
            transformDocument: (element) => {
              // Preservar todos los estilos originales
              if (element.type === 'paragraph' && element.styleId) {
                element.alignment = element.styleId.alignment;
                element.indent = element.styleId.indent;
                element.numbering = element.styleId.numbering;
                element.styleId = element.styleId.name;
              }
              if (element.type === 'run' && element.styleId) {
                element.isBold = element.styleId.bold;
                element.isItalic = element.styleId.italic;
                element.isUnderline = element.styleId.underline;
                element.font = element.styleId.font;
                element.size = element.styleId.size;
                element.color = element.styleId.color;
              }
              return element;
            },
            convertImage: mammoth.images.imgElement((image) => {
              return image.read("base64").then((imageData) => {
                const contentType = image.contentType || 'image/png';
                return {
                  src: `data:${contentType};base64,${imageData}`,
                  alt: image.altText || ''
                };
              });
            })
          }
        );

        // Extraer texto para búsqueda de variables
        const textResult = await mammoth.extractRawText({ 
          buffer: validBuffer,
          preserveNumbering: true
        });

        template = textResult.value;
        preview = htmlResult.value;

        if (htmlResult.messages.length > 0) {
          console.log('Warnings durante la conversión:', htmlResult.messages);
        }

        console.log('Documento procesado exitosamente:', {
          originalName: file.originalname,
          filePath,
          templateLength: template.length,
          previewLength: preview.length
        });

      } catch (error: any) {
        console.error('Error detallado al procesar el documento:', {
          error,
          message: error.message,
          stack: error.stack
        });

        // Intentar recuperar el documento como texto plano si falla el procesamiento
        try {
          console.log('Intentando recuperar como texto plano...');
          template = file.buffer.toString('utf-8');
          preview = template;
          filePath = await saveFile(Buffer.from(file.buffer), file.originalname);

          console.log('Documento recuperado como texto plano');
        } catch (fallbackError) {
          throw new Error(`No se pudo procesar el documento: ${error.message}`);
        }
      }

      // Si es una carga temporal, devolver el contenido
      if (formId === null) {
        return res.status(200).json({
          name: file.originalname,
          template,
          preview,
          filePath
        });
      }

      const docData = {
        formId,
        name: file.originalname,
        template,
        preview,
        filePath
      };

      console.log('Guardando documento en la base de datos:', {
        name: docData.name,
        filePath: docData.filePath,
        previewLength: docData.preview.length
      });

      const [doc] = await db.insert(documents)
        .values(docData)
        .returning();

      res.status(201).json(doc);

    } catch (error: any) {
      console.error('Error detallado al procesar el documento:', {
        error,
        message: error.message,
        stack: error.stack
      });
      return res.status(400).json({
        error: `Error al procesar el documento: ${error.message}`,
        details: error.stack
      });
    }
});
  app.post("/api/forms/:formId/documents", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);

      // Verify ownership
      const [form] = await db.select()
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

      if (!form) {
        return res.status(404).send("Form not found");
      }

      // Crear un documento DOCX básico con el contenido del template
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: req.body.template || '',
                }),
              ],
            }),
          ],
        }],
      });

      // Usar Packer para generar el buffer del documento
      const buffer = await Packer.toBuffer(doc);

      // Guardar el archivo DOCX
      const fileName = `template-${Date.now()}.docx`;
      const filePath = await saveFile(buffer, fileName);

      const preview = generatePreview(req.body.template);

      const [document] = await db.insert(documents)
        .values({
          formId,
          name: req.body.name,
          template: req.body.template,
          preview,
          filePath,
        })
        .returning();

      res.status(201).json(document);
    } catch (error: any) {
      console.error('Error creating document:', error);
      res.status(500).json({
        error: `Error creating document: ${error.message}`,
        details: error.stack
      });
    }
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

    try {
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

      // Eliminar el archivo físico primero
      await deleteFile(doc.filePath);

      // Luego eliminar el registro de la base de datos
      await db.delete(documents)
        .where(and(eq(documents.id, documentId), eq(documents.formId, formId)));

      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).send("Error deleting document");
    }
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
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);
      const documentId = parseInt(req.params.documentId);
      const entryId = parseInt(req.body.entryId);
      const isDownload = req.body.download === true;

      console.log('Iniciando operación de merge:', {
        formId,
        documentId,
        entryId,
        isDownload
      });

      // Verificaciones de seguridad y existencia
      const [form] = await db.select()
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

      if (!form) {
        return res.status(404).send("Form not found");
      }

      const [doc] = await db.select()
        .from(documents)
        .where(and(eq(documents.id, documentId), eq(documents.formId, formId)));

      if (!doc) {
        return res.status(404).send("Document not found");
      }

      const [entry] = await db.select()
        .from(entries)
        .where(and(eq(entries.id, entryId), eq(entries.formId, formId)));

      if (!entry) {
        return res.status(404).send("Entry not found");
      }

      // Verificar que el archivo existe y es un DOCX
      if (!doc.filePath.toLowerCase().endsWith('.docx')) {
        return res.status(400).json({
          error: "El archivo debe ser un documento DOCX"
        });
      }

      try {
        // Leer el archivo DOCX original
        const templateBuffer = await readFile(doc.filePath);

        console.log('Template buffer leído:', {
          size: templateBuffer.length,
          isBuffer: Buffer.isBuffer(templateBuffer),
          firstBytes: templateBuffer.slice(0, 4).toString('hex')
        });

        // Verificar que el buffer es un archivo DOCX válido (comienza con PK)
        if (templateBuffer[0] !== 0x50 || templateBuffer[1] !== 0x4B) {
          throw new Error('El archivo template no es un DOCX válido');
        }

        // Preparar datos para el merge
        const mergeData: Record<string, any> = {};
        Object.entries(entry.values || {}).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            // Mantener el tipo de dato original cuando sea posible
            if (typeof value === 'number') {
              mergeData[key] = value;
            } else if (typeof value === 'boolean') {
              mergeData[key] = value;
            } else {
              mergeData[key] = String(value);
            }
          } else {
            mergeData[key] = '';
          }
        });

        console.log('Realizando merge con datos:', {
          templateSize: templateBuffer.length,
          variables: Object.keys(mergeData)
        });

        // Realizar el merge preservando la estructura DOCX
        let mergedBuffer: Buffer;
        try {
          // Asegurarnos de que el template es un Buffer válido
          const validTemplateBuffer = Buffer.from(templateBuffer);

          // Realizar el merge con el buffer validado y opciones para preservar formato
          const result = await createReport({
            template: validTemplateBuffer,
            data: mergeData,
            cmdDelimiter: ['{{', '}}'],
            failFast: false,
            rejectNullish: false,
            processLineBreaks: true,
            processStyles: true,
            processImages: true,
            processHeadersAndFooters: true,
            processHyperlinks: true,
            processTables: true,
            processListItems: true,
            processPageBreaks: true,
            preserveQuickStyles: true,
            preserveNumbering: true,
            preserveOutline: true,
            processContentControls: true,
            processSmartTags: true,
            errorHandler: (error, cmdStr) => {
              console.error('Error en comando durante merge:', { error, cmdStr });
              return '';
            },
            additionalJsContext: {
              formatDate: (date: string) => {
                try {
                  return new Date(date).toLocaleDateString();
                } catch (e) {
                  return date;
                }
              },
              uppercase: (text: string) => String(text).toUpperCase(),
              lowercase: (text: string) => String(text).toLowerCase(),
              formatNumber: (num: number) => {
                try {
                  return new Intl.NumberFormat().format(num);
                } catch (e) {
                  return String(num);
                }
              }
            }
          });

          // Asegurarnos de que el resultado es un Buffer válido
          mergedBuffer = Buffer.from(result);

          console.log('Merge completado:', {
            resultSize: mergedBuffer.length,
            isBuffer: Buffer.isBuffer(mergedBuffer),
            firstBytes: mergedBuffer.slice(0, 4).toString('hex')
          });

        } catch (createReportError: any) {
          console.error('Error detallado en createReport:', {
            error: createReportError,
            message: createReportError.message,
            stack: createReportError.stack
          });
          throw new Error(`Error en createReport: ${createReportError.message}`);
        }

        // Verificar que el resultado es un buffer válido
        if (!Buffer.isBuffer(mergedBuffer) || mergedBuffer.length === 0) {
          throw new Error('El resultado del merge no es un buffer válido');
        }

        // Verificar que el resultado es un DOCX válido
        if (mergedBuffer[0] !== 0x50 || mergedBuffer[1] !== 0x4B) {
          throw new Error('El documento generado no es un DOCX válido');
        }

        if (isDownload) {
          // Para descarga, enviar el archivo DOCX
          const baseName = doc.name.toLowerCase().endsWith('.docx') 
            ? doc.name.slice(0, -5) 
            : doc.name;

          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          res.setHeader('Content-Disposition', `attachment; filename="${baseName}.docx"`);
          return res.send(mergedBuffer);
        } else {
          // Para vista previa, convertir a HTML preservando todos los estilos
          const result = await mammoth.convertToHtml(
            { buffer: mergedBuffer },
            {
              styleMap: [
                "p[style-name='Normal'] => p:fresh",
                "p[style-name='Heading 1'] => h1:fresh",
                "p[style-name='Heading 2'] => h2:fresh",
                "p[style-name='Heading 3'] => h3:fresh",
                "p[style-name='List Paragraph'] => p.list-paragraph:fresh",
                "r[style-name='Strong'] => strong",
                "r[style-name='Emphasis'] => em",
                "r[style-name='style1'] => strong",
                "r[style-name='style2'] => em",
                "b => strong",
                "i => em",
                "u => u",
                "strike => s",
                "tab => span.tab",
                "br => br",
                "table => table",
                "tr => tr",
                "td => td",
                "p[style-name='Footer'] => div.footer > p:fresh",
                "p[style-name='Header'] => div.header > p:fresh"
              ],
              includeDefaultStyleMap: true,
              transformDocument: (element) => {
                // Preservar los estilos originales del documento
                if (element.type === 'paragraph' && element.styleId) {
                  element.alignment = element.styleId.alignment;
                  element.indent = element.styleId.indent;
                  element.numbering = element.styleId.numbering;
                  element.styleId = element.styleId.name;
                }
                if (element.type === 'run' && element.styleId) {
                  element.isBold = element.styleId.bold;
                  element.isItalic = element.styleId.italic;
                  element.isUnderline = element.styleId.underline;
                  element.font = element.styleId.font;
                  element.size = element.styleId.size;
                  element.color = element.styleId.color;
                }
                return element;
              }
            }
          );

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
                text-align: justify;
                white-space: pre-wrap;
              }
              .document-preview h1 { font-size: 24px; font-weight: bold; margin: 24px 0 12px; }
              .document-preview h2 { font-size: 20px; font-weight: bold; margin: 20px 0 10px; }
              .document-preview h3 { font-size: 16px; font-weight: bold; margin: 16px 0 8px; }
              .document-preview .tab { display: inline-block; width: 36px; }
              .document-preview table {
                border-collapse: collapse;
                width: 100%;
                margin: 1em 0;
              }
              .document-preview td, .document-preview th {
                border: 1px solid #ddd;
                padding: 8px;
                vertical-align: top;
              }
              .document-preview .list-paragraph { margin-left: 24px; }
              .document-preview .header {
                position: relative;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 1px solid #eee;
              }
              .document-preview .footer {
                position: relative;
                margin-top: 20px;
                padding-top: 10px;
                border-top: 1px solid #eee;
              }
              /* Estilos adicionales para preservar formato */
              .document-preview [style*="text-align:"] { text-align: inherit; }
              .document-preview [style*="margin-left:"] { margin-left: inherit; }
              .document-preview [style*="text-indent:"] { text-indent: inherit; }
              .document-preview [style*="font-family:"] { font-family: inherit; }
              .document-preview [style*="font-size:"] { font-size: inherit; }
              .document-preview [style*="color:"] { color: inherit; }
              .document-preview [style*="background-color:"] { background-color: inherit; }
              .document-preview strong { font-weight: bold; }
              .document-preview em { font-style: italic; }
              .document-preview u { text-decoration: underline; }
              .document-preview s { text-decoration: line-through; }
            </style>
            <div class="document-preview">
              ${result.value}
            </div>`;

          return res.json({ result: styledHtml });
        }
      } catch (mergeError: any) {
        console.error('Error en el merge:', {
          error: mergeError,
          message: mergeError.message,
          stack: mergeError.stack,
          name: mergeError.name
        });

        return res.status(500).json({
          error: `Error en el proceso de merge: ${mergeError.message}`,
          details: mergeError.stack,
          name: mergeError.name
        });
      }
    } catch (error: any) {
      console.error('Error en el procesamiento:', {
        error,
        message: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        error: `Error procesando el documento: ${error.message}`,
        details: error.stack
      });
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
      .from(forms)      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

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