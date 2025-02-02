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

  // Rutas existentes permanecen igual...
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
            buffer: mergedBuffer,
            options: {
              transformDocument: (input: any) => {
                return input;
              },
              // Mantener absolutamente todos los estilos y estructura
              styleMap: [
                "p[style-name='Normal'] => p:fresh",
                "p[style-name='Title'] => h1:fresh",
                "p[style-name='Heading 1'] => h1:fresh",
                "p[style-name='Heading 2'] => h2:fresh",
                "p[style-name='Heading 3'] => h3:fresh",
                "p[style-name='List Paragraph'] => p.list-paragraph:fresh",
                "r[style-name='Strong'] => strong",
                "r[style-name='Bold'] => strong",
                "r[style-name='Emphasis'] => em",
                "b => strong",
                "i => em",
                "u => u",
                "strike => s",
                "w:p => p:fresh",
                "w:r => span:fresh",
                "w:t => span:fresh",
                "w:rPr/w:b => strong",
                "w:rPr/w:i => em",
                "w:rPr/w:u => u",
                "w:pPr/w:jc[@w:val='center'] => p.align-center:fresh",
                "w:pPr/w:jc[@w:val='right'] => p.align-right:fresh",
                "w:pPr/w:jc[@w:val='justify'] => p.align-justify:fresh",
                "table => table",
                "tr => tr",
                "td => td"
              ],
              ignoreEmptyParagraphs: false,
              preserveEmptyParagraphs: true,
              includeDefaultStyleMap: true,
              idPrefix: 'doc-'
            }
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

  const httpServer = createServer(app);
  return httpServer;
}