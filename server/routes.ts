import { Express, Request } from "express";
import express from "express";
import { createServer } from "http";
import multer from "multer";
import { db } from "@db";
import { forms, variables, entries, documents, users, formShares } from "@db/schema";
import { eq, and, desc, asc, ne, sql } from "drizzle-orm";
import { Parser } from "json2csv";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { promises as fs } from "fs";
import path from "path";
import { setupAuth } from "./auth";
import { saveFile, readFile, deleteFile } from "./storage";

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

// Función para garantizar que el usuario está autenticado
function ensureAuth(req: Request) {
  if (!req.isAuthenticated()) {
    throw new Error("Unauthorized");
  }
  return req.user!;
}

const THUMBNAIL_DIR = path.join(process.cwd(), 'storage', 'thumbnails');

// Asegurar que existe el directorio de thumbnails
async function ensureThumbnailDir() {
  try {
    await fs.mkdir(THUMBNAIL_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating thumbnail directory:', error);
    throw error;
  }
}

// Función para extraer texto de imagen usando Tesseract OCR
async function extractTextFromImage(imagePath: string): Promise<string> {
  try {
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
      exec(`tesseract "${imagePath}" stdout`, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else if (stderr) {
          reject(new Error(stderr));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  } catch (error) {
    console.error('Error running OCR:', error);
    return '';
  }
}

export function registerRoutes(app: Express) {
  setupAuth(app);

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

      // Verificar propiedad del formulario si no es temporal
      if (formId !== null) {
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
      let filePath = '';
      let thumbnailPath = '';
      let extractedVariables: string[] = [];

      try {
        console.log('Procesando documento...');
        await ensureThumbnailDir();

        // Asegurar que tenemos un buffer válido
        const validBuffer = Buffer.from(file.buffer);

        // Guardar el archivo original
        filePath = await saveFile(validBuffer, file.originalname);

        try {
          // Generar thumbnail para todos los documentos
          const { thumbnailPath: thumbPath, extractedVariables: vars } = await generateThumbnail(validBuffer);
          thumbnailPath = thumbPath;
          extractedVariables = vars;

          // Extraer texto para variables
          const textResult = await mammoth.extractRawText({
            buffer: validBuffer
          });

          if (textResult.value) {
            template = textResult.value;
          }

          // Si no se pudo extraer texto, usar OCR
          if (!template) {
            console.log('Usando OCR para extraer texto...');
            template = await extractTextFromImage(path.join(THUMBNAIL_DIR, thumbnailPath));
          }

          if (!template) {
            template = "No se pudo extraer texto del documento. Por favor, agregue las variables manualmente.";
          }

        } catch (error) {
          console.error('Error procesando documento:', error);
          const { thumbnailPath: thumbPath, extractedVariables: vars } = await generateThumbnail(validBuffer);
          thumbnailPath = thumbPath;
          extractedVariables = vars;
          template = "Error al procesar el documento. Por favor, agregue las variables manualmente.";
        }

        // Preparar respuesta
        const response = {
          name: file.originalname,
          template,
          thumbnailPath: thumbnailPath ? path.basename(thumbnailPath) : null,
          filePath,
          extractedVariables
        };

        // Si es temporal, devolver directamente
        if (formId === null) {
          return res.status(200).json(response);
        }

        // Si no es temporal, guardar en la base de datos
        const [doc] = await db.insert(documents)
          .values({
            formId,
            name: file.originalname,
            template,
            filePath,
            thumbnailPath: thumbnailPath || null
          })
          .returning();

        res.status(201).json(doc);

      } catch (error: any) {
        console.error('Error procesando documento:', error);
        res.status(400).json({
          error: `Error procesando documento: ${error.message}`,
          details: error.stack
        });
      }
    } catch (error: any) {
      console.error('Error en el endpoint:', error);
      res.status(500).json({
        error: `Error del servidor: ${error.message}`,
        details: error.stack
      });
    }
  });

  app.post("/api/forms/:formId/documents/extract-ocr", async (req, res) => {
    try {
      const thumbnailPath = req.body.thumbnailPath;
      if (!thumbnailPath) {
        return res.status(400).json({
          error: "Se requiere la ruta del thumbnail"
        });
      }

      const fullPath = path.join(THUMBNAIL_DIR, thumbnailPath);
      console.log('Iniciando proceso OCR adicional...');
      const extractedText = await extractTextFromImage(fullPath);
      console.log('OCR Text extracted:', extractedText);

      // Detectar variables en el texto extraído
      const extractedVariables = detectVariables(extractedText).valid;
      console.log('Variables detected from OCR:', extractedVariables);

      res.json({
        extractedVariables,
        message: "OCR completado exitosamente"
      });
    } catch (error: any) {
      console.error('Error en proceso OCR:', error);
      res.status(500).json({
        error: `Error en procesoOCR: ${error.message}`,
        details: error.stack
      });
    }
  });

  app.get("/api/forms/:formId/documents", async (req, res) => {
    const user = ensureAuth(req);
    const formId = parseInt(req.params.formId);

    console.log('Consultando documentos para formulario:', {
      formId,
      userId: user.id
    });

    // Verify ownership
    const [form] = await db.select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

    if (!form) {
      console.log('Formulario no encontrado:', { formId, userId: user.id });
      return res.status(404).send("Form not found");
    }

    try {
      const docs = await db.select()
        .from(documents)
        .where(eq(documents.formId, formId));

      console.log('Documentos encontrados:', {
        formId,
        count: docs.length,
        documentIds: docs.map(d => d.id),
        documentNames: docs.map(d => d.name)
      });

      res.json(docs);
    } catch (error: any) {
      console.error('Error al consultar documentos:', {
        error,
        message: error.message,
        formId
      });
      res.status(500).json({
        error: 'Error al consultar documentos',
        details: error.message
      });
    }
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
      if (doc.thumbnailPath) {
        await deleteFile(path.join(THUMBNAIL_DIR, doc.thumbnailPath));
      }

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

        //        // Verificar que el buffer es un archivo DOCX válido (comienza con PK)
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

        // Extraer y normalizar variables del template
        const templateContent = await mammoth.extractRawText({ buffer: copiedBuffer });
        const templateText = templateContent.value;

        // Función para normalizar nombres de variables
        const normalizeVarName = (name: string) => {
          return name.replace(/\s+/g, '').toLowerCase();
        };

        // Extraer y normalizar todas las variables
        const variableRegex = /{{([^{}]+)}}/g;
        let match;

        // Extraer variables manteniendo el formato original
        const rawVars = new Set();
        while ((match = variableRegex.exec(templateText)) !== null) {
          const originalVarName = match[1].trim();
          const varName = originalVarName.split(/[\s\n]+/)[0]; // Tomar solo la primera parte antes de espacios o saltos
          if (varName && !varName.includes('CMD_NODE')) {
            // Guardar el nombre original
            rawVars.add(originalVarName);
          }
        }

        // Extraer variables del template original
        variableRegex.lastIndex = 0; // Reset regex index
        while ((match = variableRegex.exec(doc.template)) !== null) {
          const varName = match[1].trim().split(/[\s\n]+/)[0];
          if (varName && !varName.includes('CMD_NODE')) {
            rawVars.add(varName);
          }
        }

        // Crear un mapa de nombres normalizados a nombres originales
        const varMap = new Map();
        rawVars.forEach(varName => {
          const normalizedName = normalizeVarName(varName);
          varMap.set(normalizedName, varName);
        });

        // Usar nombres únicos normalizados
        const templateVars = new Set(Array.from(varMap.values()));

        // Luego procesar los valores
        templateVars.forEach(varName => {
          const value = entry.values?.[varName];
          if (value !== undefined && value !== null) {
            if (typeof value === 'number') {
              mergeData[varName] = value.toString();
            } else if (typeof value === 'boolean') {
              mergeData[varName] = value.toString();
            } else {
              mergeData[varName] = String(value);
            }
          } else {
            mergeData[varName] = '';
          }
        });

        console.log('Variables detectadas:', templateVars);
        console.log('Datos para merge:', mergeData);

        // Realizar el merge sobre la copia temporal
        let mergedBuffer: Buffer;
        try {
          const result = await createReport({
            template: copiedBuffer,
            data: mergeData,
            cmdDelimiter: ['{{', '}}'],
            failFast: false,
            rejectNullish: false,
            preprocessTemplate: (template) => {
              // Limpiar variables mal formadas
              return template.replace(/{{([^{}]+)}}/g, (match, varName) => {
                const cleanVarName = varName.trim().split(/[\s\n]+/)[0];
                if (cleanVarName && mergeData[cleanVarName] !== undefined) {
                  return `{{${cleanVarName}}}`;
                }
                return match;
              });
            },
            processImages: true,
            processHeadersAndFooters: true,
            processHyperlinks: true,
            processLineBreaks: true,
            processTables: true,
            processStyles: true,
            processTheme: true,
            processVariables: true,
            processNumbering: true,
            preserveQuickStyles: true,
            preserveNumbering: true,
            preserveOutline: true,
            preserveStaticContent: true,
            preserveItalics: true,
            preserveStyles: true,
            keepStyles: true,
            fixSmartQuotes: true,
            renderFormatting: true,
            preprocessHtml: (html: string) => {
              // Función para extraer el nombre de la variable
              const extractVariableName = (text: string) => {
                const match = text.match(/{{([^}]+)}}/);
                return match ? match[1].trim() : '';
              };

              // Normalizar todas las variables independientemente de su formato
              const normalizeVariables = (text: string) => {
                return text.replace(/{{([^}]+)}}/g, (match, variable) => {
                  const cleanVariable = variable.trim().replace(/[^a-zA-Z0-9_]/g, '');
                  return `{{${cleanVariable}}}`;
                });
              };

              const DOMParser = require('xmldom').DOMParser;
              const XMLSerializer = require('xmldom').XMLSerializer;

              // Crear parser y serializer
              const parser = new DOMParser();
              const serializer = new XMLSerializer();

              // Convertir HTML a DOM
              const doc = parser.parseFromString(html, 'text/xml');

              // Función para procesar nodos de texto
              const processTextNodes = (node) => {
                if (node.nodeType === 3 && node.nodeValue.includes('{{')) {
                  const parentRun = node.parentNode.parentNode; // w:r element
                  if (!parentRun || parentRun.nodeName !== 'w:r') return;

                  // Preservar todos los elementos de estilo existentes
                  const rPr = parentRun.getElementsByTagName('w:rPr')[0];
                  const styles = [];

                  if (rPr) {
                    // Copiar todos los elementos de estilo existentes
                    Array.from(rPr.childNodes).forEach(child => {
                      if (child.nodeName) {
                        styles.push(child.nodeName);
                      }
                    });
                  }

                  // Crear nuevo rPr con todos los estilos
                  let newStyle = '<w:rPr>';
                  styles.forEach(style => {
                    if (style === 'w:i' || style === 'w:b' || style === 'w:u' || style === 'w:color' || style === 'w:sz') {
                      newStyle += `<${style}/>`;
                    }
                  });
                  newStyle += '</w:rPr>';

                  const varName = node.nodeValue.match(/{{([^}]+)}}/)[1].trim();
                  const newText = `${newStyle}<w:t xml:space="preserve">{{${varName}}}</w:t>`;

                  // Reemplazar contenido manteniendo el nodo w:r
                  parentRun.innerHTML = newText;
                }

                // Procesar hijos recursivamente
                for (let child of node.childNodes) {
                  processTextNodes(child);
                }
              };

              // Procesar documento
              processTextNodes(doc.documentElement);

              // Convertir DOM de vuelta a string
              let processedHtml = serializer.serializeToString(doc);

              // Procesar variables en texto normal
              processedHtml = processedHtml.replace(/([a-zñáéíóúA-ZÑÁÉÍÓÚ,.:;!?])?{{([^}]+)}}([a-zñáéíóúA-ZÑÁÉÍÓÚ,.:;!?])?/g, (match, prefix, variable, suffix) => {
                const cleanVariable = variable.trim().replace(/[^a-zA-Z0-9_]/g, '');
                const prefixStr = prefix || '';
                const suffixStr = suffix || '';
                return `<w:r><w:t xml:space="preserve">${prefixStr}{{${cleanVariable}}}${suffixStr}</w:t></w:r>`;
              });

              return processedHtml;
            },
            processLineBreaks: true,
            postprocessRun: (run: any) => {
              if (run.text) {
                // Limpiar el texto de caracteres invisibles o especiales
                const cleanText = run.text.replace(/[^a-zA-Z0-9_{} ]/g, '');
                if (cleanText.includes('{{')) {
                  const style = run.style || {};
                  if (run.italic) {
                    style.fontStyle = 'italic';
                    run.italic = true;
                  }
                  if (run.bold) {
                    style.fontWeight = 'bold';
                    run.bold = true;
                  }
                  run.style = style;
                  run.preserveFormat = true;
                  run.text = cleanText;
                }
              }
              return run;
            },
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
              //              return cmdStr;
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
        const selectedFields = req.query.fields?.toString().split(',') || variables.map(v => v.name);
        const fields = variables
          .filter(v => selectedFields.includes(v.name))
          .map(v => ({
            label: v.label,
            value: (row: any) => row.values[v.name]
          }));
        if (selectedFields.includes('createdAt')) {
          fields.push({
            label: 'Fecha de Creación',
            value: 'createdAt'
          });
        }

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
  // Agregar endpoint para servir thumbnails
  app.use('/thumbnails', express.static(THUMBNAIL_DIR));

  app.post("/api/users/:userId/follow", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const userId = parseInt(req.params.userId);

      // Verificar que el usuario existe
      const [targetUser] = await db.select()
        .from(users)
        .where(eq(users.id, userId));

      if (!targetUser) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      if (user.id === userId) {
        return res.status(400).json({ error: "No puedes seguirte a ti mismo" });
      }

      // Por ahora solo retornamos éxito
      // En una futura iteración implementaremos la tabla de seguidores
      res.status(200).json({ message: "Usuario seguido exitosamente" });
    } catch (error) {
      console.error('Error following user:', error);
      res.status(500).json({ error: "Error al seguir usuario" });
    }
  });

  // Share form endpoint
  app.post("/api/forms/:formId/share", async (req, res) => {
    try {
      const user = ensureAuth(req);
      const formId = parseInt(req.params.formId);
      const { userId, permissions } = req.body;

      if (!userId || !permissions) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Verify form ownership
      const [form] = await db.select()
        .from(forms)
        .where(and(eq(forms.id, formId), eq(forms.userId, user.id)));

      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }

      // Check if user exists
      const [targetUser] = await db.select()
        .from(users)
        .where(eq(users.id, userId));

      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if share already exists
      const [existingShare] = await db.select()
        .from(formShares)
        .where(and(
          eq(formShares.formId, formId),
          eq(formShares.userId, userId)
        ));

      if (existingShare) {
        // Update existing share
        const [updatedShare] = await db.update(formShares)
          .set({
            ...permissions,
            updatedAt: new Date()
          })
          .where(eq(formShares.id, existingShare.id))
          .returning();

        return res.json(updatedShare);
      }

      // Create new share
      const [newShare] = await db.insert(formShares)
        .values({
          formId,
          userId,
          ...permissions,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      res.json(newShare);
    } catch (error) {
      console.error('Error sharing form:', error);
      res.status(500).json({ error: "Error sharing form" });
    }
  });

  // Users endpoint
  app.get("/api/users", async (req, res) => {
    try {
      const user = ensureAuth(req);

      const allUsers = await db.query.users.findMany({
        where: ne(users.id, user.id),
        columns: {
          id: true,
          username: true,
          isPremium: true
        }
      });

      // Transform the results to match the expected interface
      const transformedUsers = allUsers.map(user => ({
        id: user.id,
        username: user.username,
        isPremium: user.isPremium
      }));

      console.log('Usuarios encontrados:', transformedUsers);

      res.json(transformedUsers);
    } catch (error) {
      console.error('Error al obtener usuarios:', error);
      res.status(500).json({ error: "Error obteniendo usuarios" });
    }
  });

  // Form endpoints
  app.get("/api/forms", async (req, res) => {
    const user = ensureAuth(req);

    try {
      // Get user's own forms
      const ownedForms = await db.query.forms.findMany({
        where: eq(forms.userId, user.id),
        with: {
          variables: true,
        },
      });

      // Get forms shared with the user
      const sharedForms = await db.query.formShares.findMany({
        where: eq(formShares.userId, user.id),
        with: {
          form: {
            with: {
              variables: true,
              documents: {
                // Only include documents if user has merge permissions
                where: (formShares, { eq, and }) => 
                  and(eq(formShares.userId, user.id), eq(formShares.canMerge, true))
              }
            }
          }
        }
      });

      // Transform shared forms to match the format of owned forms
      const transformedSharedForms = sharedForms.map(share => ({
        ...share.form,
        isShared: true,
        permissions: {
          canEdit: share.canEdit,
          canMerge: share.canMerge,
          canDelete: share.canDelete,
          canShare: share.canShare,
          canViewEntries: share.canViewEntries
        }
      }));

      // Combine both sets of forms
      const allForms = [
        ...ownedForms.map(form => ({ ...form, isShared: false })),
        ...transformedSharedForms
      ];

      console.log('Forms encontrados:', {
        ownedCount: ownedForms.length,
        sharedCount: sharedForms.length,
        total: allForms.length
      });

      res.json(allForms);
    } catch (error) {
      console.error('Error fetching forms:', error);
      res.status(500).json({ error: "Error obteniendo formularios" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}