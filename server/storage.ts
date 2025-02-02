import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

// Directorio base para almacenar archivos
const STORAGE_DIR = path.join(process.cwd(), 'storage', 'documents');

// Asegurar que el directorio existe
async function ensureStorageDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating storage directory:', error);
    throw error;
  }
}

// Generar un nombre de archivo único manteniendo la extensión original
function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const hash = crypto.createHash('md5').update(`${timestamp}-${originalName}`).digest('hex');
  const ext = path.extname(originalName);
  return `${hash}${ext}`;
}

// Guardar un archivo
export async function saveFile(buffer: Buffer, originalName: string): Promise<string> {
  await ensureStorageDir();
  const fileName = generateUniqueFileName(originalName);
  const filePath = path.join(STORAGE_DIR, fileName);

  try {
    // Escribir el archivo en modo binario
    await fs.writeFile(filePath, buffer);
    return fileName;
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
}

// Leer un archivo
export async function readFile(fileName: string): Promise<Buffer> {
  const filePath = path.join(STORAGE_DIR, fileName);
  try {
    // Leer el archivo en modo binario
    return await fs.readFile(filePath);
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
}

// Eliminar un archivo
export async function deleteFile(fileName: string): Promise<void> {
  const filePath = path.join(STORAGE_DIR, fileName);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}