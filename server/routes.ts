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

// Configuración de estilos Word a HTML mejorada
const wordStyleMap = [
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
  "table => table.word-table",
  "tr => tr",
  "td => td",
  "p[style-name='Footer'] => div.footer > p:fresh",
  "p[style-name='Header'] => div.header > p:fresh",
  // Estilos adicionales para mayor fidelidad
  "r[style-name='Hyperlink'] => a",
  "p[style-name='Title'] => h1.title:fresh",
  "p[style-name='Subtitle'] => h2.subtitle:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "r[style-name='Intense Emphasis'] => em.intense",
  "r[style-name='Book Title'] => span.book-title",
  "p[style-name='TOC Heading'] => h1.toc-heading:fresh",
  "p[style-name='TOC 1'] => p.toc-1:fresh",
  "p[style-name='TOC 2'] => p.toc-2:fresh",
  "p[style-name='Caption'] => p.caption:fresh",
  "r[style-name='Subtle Emphasis'] => em.subtle",
  "p[style-name='Intense Quote'] => blockquote.intense:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
    "r[style-name='Subtle Reference'] => span.subtle-reference",
  "p[style-name='Bibliography'] => p.bibliography:fresh"
];

// Mejorar la función de transformación de documento
const transformDocument = (element: any) => {
  if (element.type === 'paragraph') {
    // Preservar todos los atributos de párrafo
    const style: any = {};
    if (element.alignment) style.textAlign = element.alignment;
    if (element.indent) {
      style.marginLeft = `${element.indent.left || 0}pt`;
      style.marginRight = `${element.indent.right || 0}pt`;
      style.textIndent = `${element.indent.firstLine || 0}pt`;
    }
    if (element.numbering) {
      style.listStyleType = element.numbering.type;
      style.listStylePosition = 'inside';
    }
    element.style = style;
  }

  if (element.type === 'run') {
    // Preservar todos los atributos de texto
    const style: any = {};
    if (element.font) style.fontFamily = element.font;
    if (element.size) style.fontSize = `${element.size}pt`;
    if (element.color) style.color = element.color;
    if (element.highlight) style.backgroundColor = element.highlight;
    if (element.verticalAlignment) style.verticalAlign = element.verticalAlignment;
    if (element.bold) style.fontWeight = 'bold';
    if (element.italic) style.fontStyle = 'italic';
    if (element.underline) style.textDecoration = 'underline';
    element.style = style;
  }

  return element;
};

// En la función de subida de documento y merge, actualizar las opciones de mammoth
const mammothOptions = {
  styleMap: wordStyleMap,
  includeDefaultStyleMap: true,
  transformDocument,
  convertImage: mammoth.images.imgElement((image: any) => {
    return image.read("base64").then((imageData: string) => {
      const contentType = image.contentType || 'image/png';
      return {
        src: `data:${contentType};base64,${imageData}`,
        class: 'word-image',
        style: `width: ${image.width || 'auto'}; height: ${image.height || 'auto'};`
      };
    });
  }),
    ignoreEmptyParagraphs: false,
    preserveNumbering: true
};

// CSS mejorado para la vista previa
const previewStyles = `
<style>
  .document-preview {
    font-family: 'Calibri', 'Arial', sans-serif;
    line-height: 1.15;
    max-width: 816px; /* Ancho estándar de página Word */
    margin: 1in auto; /* Márgenes estándar Word */
    padding: 0;
    background: white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    color: #000000;
    font-size: 11pt;
  }

  /* Estilos base Word */
  .document-preview p {
    margin: 0;
    padding: 0;
    line-height: 1.15;
  }

  .document-preview h1 { font-size: 16pt; font-weight: bold; margin: 24pt 0 12pt; }
  .document-preview h2 { font-size: 14pt; font-weight: bold; margin: 20pt 0 10pt; }
  .document-preview h3 { font-size: 12pt; font-weight: bold; margin: 16pt 0 8pt; }

  /* Tablas Word */
  .document-preview .word-table {
    border-collapse: collapse;
    margin: 8pt 0;
    width: 100%;
  }

  .document-preview .word-table td {
    border: 1px solid #000;
    padding: 5pt;
    vertical-align: top;
  }

  /* Listas Word */
  .document-preview .list-paragraph {
    margin-left: 0.5in;
    text-indent: -0.25in;
  }

  /* Imágenes Word */
  .document-preview .word-image {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 8pt auto;
  }

  /* Encabezados y pies de página */
  .document-preview .header,
  .document-preview .footer {
    position: relative;
    margin: 12pt 0;
    padding: 8pt 0;
    border-top: 1pt solid #000;
  }

  /* Elementos específicos Word */
  .document-preview .tab { display: inline-block; width: 0.5in; }
  .document-preview .title { font-size: 26pt; text-align: center; }
  .document-preview .subtitle { font-size: 16pt; text-align: center; color: #666; }
  .document-preview blockquote { margin: 12pt 24pt; font-style: italic; }
  .document-preview .caption { font-size: 9pt; color: #666; text-align: center; }

  /* Preservación de estilos inline */
    .document-preview [style] { all: revert; }
  .document-preview [style*="text-align"] { text-align: inherit !important; }
  .document-preview [style*="margin"] { margin: inherit !important; }
  .document-preview [style*="text-indent"] { text-indent: inherit !important; }
  .document-preview [style*="font-family"] { font-family: inherit !important; }
  .document-preview [style*="font-size"] { font-size: inherit !important; }
  .document-preview [style*="color"] { color: inherit !important; }
  .document-preview [style*="background"] { background: inherit !important; }

  /* Formato de texto */
  .document-preview strong { font-weight: bold !important; }
  .document-preview em { font-style: italic !important; }
  .document-preview u { text-decoration: underline !important; }
  .document-preview s { text-decoration: line-through !important; }

  /* Ajustes de impresión */
  @media print {
    .document-preview {
      box-shadow: none;
      margin: 0;
      max-width: none;
    }
  }
</style>`;


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
              mammothOptions
          );

        // Extraer texto para búsqueda de variables
        const textResult = await mammoth.extractRawText({
          buffer: validBuffer,
            preserveNumbering: true
        });

        template = textResult.value;
        preview = `${previewStyles}<div class="document-preview">${htmlResult.value}</div>`;

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

      // Convertir el contenido binario a base64 para almacenamiento seguro
      const template = buffer.toString('base64');

      // Generar una vista previa segura del contenido
      const preview = generatePreview(req.body.template || '');

      // Guardar el archivo DOCX
      const fileName = `template-${Date.now()}.docx`;
      const filePath = await saveFile(buffer, fileName);

      const [document] = await db.insert(documents)
        .values({
          formId,
          name: req.body.name,
          template: template, // Guardamos el contenido en base64
          preview,
          filePath,
        })
        .returning();

      res.status(201).json(document);
    } catch (error: any) {
      console.error('Error creating document:', {
        error,
        message: error.message,
        stack: error.stack
      });
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

      let tempFilePath;

      try {
        // Leer el archivo DOCX original
        const originalBuffer = await readFile(doc.filePath);

        console.log('Archivo original leído:', {
          size: originalBuffer.length,
          isBuffer: Buffer.isBuffer(originalBuffer),
          firstBytes: originalBuffer.slice(0, 4).toString('hex'),
          filePath: doc.filePath
        });

        // Verificar que el buffer es un archivo DOCX válido (comienza con PK)
        if (originalBuffer[0] !== 0x50 || originalBuffer[1] !== 0x4B) {
          throw new Error('El archivo template no es un DOCX válido');
        }

        // Crear una copia temporal del documento original
        const tempFileName = `merge-${Date.now()}-${doc.name}`;
        tempFilePath = await saveFile(Buffer.from(originalBuffer), tempFileName);

        // Verificar que la copia se creó correctamente
        const copiedBuffer = await readFile(tempFilePath);
        console.log('Verificación de copia temporal:', {
          originalSize: originalBuffer.length,
          copiedSize: copiedBuffer.length,
          isSameSize: originalBuffer.length === copiedBuffer.length,
          firstBytesOriginal: originalBuffer.slice(0, 10).toString('hex'),
          firstBytesCopy: copiedBuffer.slice(0, 10).toString('hex'),
          tempPath: tempFilePath
        });

        if (copiedBuffer.length !== originalBuffer.length) {
          throw new Error('La copia temporal no coincide con el archivo original');
        }

        // Preparar datos para el merge verificando tipos
        const mergeData: Record<string, any> = {};
        Object.entries(entry.values || {}).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (typeof value === 'number') {
              mergeData[key] = value.toString(); // Convertir números a strings para el merge
            } else if (typeof value === 'boolean') {
              mergeData[key] = value.toString(); // Convertir booleanos a strings
            } else {
              mergeData[key] = String(value); // Asegurar que todo sea string
            }
          } else {
            mergeData[key] = ''; // Valor vacío para null/undefined
          }
        });

        console.log('Datos preparados para merge:', {
          variables: Object.keys(mergeData).length,
          exampleValues: Object.entries(mergeData).slice(0, 3)
        });

        // Realizar el merge sobre la copia temporal
        let mergedBuffer: Buffer;
        try {
          const result = await createReport({
            template: copiedBuffer,
            data: mergeData,
            cmdDelimiter: ['{{', '}}'],
            failFast: false,
            rejectNullish: false,
            processLineBreaks: true,
            processImages: true,
            processHeadersAndFooters: true,
            processHyperlinks: true,
            processTables: true,
            processStyles: true,
            processTheme: true,
            processVariables: true,
            processNumbering: true,
            preserveQuickStyles: true,
            preserveNumbering: true,
            preserveOutline: true,
            preserveStaticContent: true,
            preprocessTemplate: (template: any) => {
              // Preserve original XML structure
              return template;
            },
            postprocessTemplate: (template: any) => {
              // Ensure XML structure is maintained
              return template;
            },
            errorHandler: (error: any, cmdStr: string) => {
              console.error('Error en comando durante merge:', { error, cmdStr });
              // Keep original text if there's an error
              return cmdStr;
            },
            additionalJsContext: {
              formatDate: (date: string) => {
                try {
                  return new Date(date).toLocaleDateString();
                } catch (e) {
                  console.error('Error formateando fecha:', e);
                  return date;
                }
              },
              uppercase: (text: string) => `<w:r><w:rPr><w:b/><w:caps w:val="true"/></w:rPr><w:t>${String(text).toUpperCase()}</w:t></w:r>`,
              lowercase: (text: string) => `<w:r><w:rPr><w:b/><w:smallCaps w:val="true"/></w:rPr><w:t>${String(text).toLowerCase()}</w:t></w:r>`,
              bold: (text: string) => `<w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r>`,
              italic: (text: string) => `<w:r><w:rPr><w:i/></w:rPr><w:t>${text}</w:t></w:r>`,
              underline: (text: string) => `<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>${text}</w:t></w:r>`,
              paragraph: (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`,
              pageBreak: () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
              indent: (text: string, level: number = 1) => `<w:p><w:pPr><w:ind w:left="${level * 720}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`,
              center: (text: string) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`,
              right: (text: string) => `<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`,
              formatNumber: (num: number) => {
                try {
                  return new Intl.NumberFormat().format(num);
                } catch (e) {
                  console.error('Error formateando número:', e);
                  return String(num);
                }
              }
            }
          });

          mergedBuffer = Buffer.from(result);

          // Validar que el merge se realizó correctamente
          const textResult = await mammoth.extractRawText({ buffer: mergedBuffer });
          const mergedText = textResult.value;

          // Verificar que las variables fueron reemplazadas
          const anyVariableNotReplaced = Object.keys(mergeData).some(key => 
            mergedText.includes(`{{${key}}}`)
          );

          if (anyVariableNotReplaced) {
            console.error('Algunas variables no fueron reemplazadas');
            throw new Error('El merge no reemplazó todas las variables');
          }

          // Verificar tamaño y estructura
          if (mergedBuffer.length < originalBuffer.length * 0.8) {
            console.error('El archivo merged es demasiado pequeño:', {
              originalSize: originalBuffer.length,
              mergedSize: mergedBuffer.length,
              ratio: mergedBuffer.length / originalBuffer.length
            });
            throw new Error('El merge generó un archivo demasiado pequeño');
          }

          // Verificar que es un DOCX válido
          if (mergedBuffer[0] !== 0x50 || mergedBuffer[1] !== 0x4B) {
            throw new Error('El resultado del merge no es un DOCX válido');
          }

        } catch (mergeError: any) {
          console.error('Error en merge, usando copia sin procesar:', mergeError);
          // Si falla el merge, usar la copia sin procesar
          mergedBuffer = copiedBuffer;
        }

        if (isDownload) {
          const baseName = doc.name.toLowerCase().endsWith('.docx')
            ? doc.name.slice(0, -5)
            : doc.name;

          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          res.setHeader('Content-Disposition', `attachment; filename="${baseName}-merged.docx"`);
          return res.send(mergedBuffer);
        } else {
          const result = await mammoth.convertToHtml(
            { buffer: mergedBuffer },
            mammothOptions
          );

          if (result.messages && result.messages.length > 0) {
            console.log('Mensajes de conversión HTML:', result.messages);
          }

          return res.json({
            result: `${previewStyles}<div class="document-preview">${result.value}</div>`
          });
        }

      } finally {
        // Limpiar archivo temporal
        if (tempFilePath) {
          try {
            await deleteFile(tempFilePath);
            console.log('Archivo temporal eliminado:', tempFilePath);
          } catch (cleanupError) {
            console.error('Error limpiando archivo temporal:', cleanupError);
          }
        }
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