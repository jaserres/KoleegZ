import { promises as fs } from 'fs';
import path from 'path';

// Directorio base para almacenar archivos
const STORAGE_DIR = path.join(process.cwd(), 'storage', 'documents');

// Asegurar que el directorio existe
async function ensureStorageDir() {
  try {
    await fs.access(STORAGE_DIR);
  } catch {
    try {
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      console.log(`Storage directory created at ${STORAGE_DIR}`);
    } catch (error) {
      console.error('Error creating storage directory:', error);
      throw error;
    }
  }
}

// Guardar un archivo usando el nombre proporcionado directamente
export async function saveFile(fileName: string, buffer: Buffer): Promise<string> {
  await ensureStorageDir();
  const filePath = path.join(STORAGE_DIR, fileName);

  try {
    await fs.writeFile(filePath, buffer);
    console.log(`File saved successfully at ${filePath}`);
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
    console.log(`Attempting to read file from ${filePath}`);
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (!exists) {
      throw new Error(`File not found at ${filePath}`);
    }
    const buffer = await fs.readFile(filePath);
    return Buffer.from(buffer); // Asegurar que devolvemos un Buffer válido
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
}

// Eliminar un archivo
export async function deleteFile(fileName: string): Promise<void> {
  const filePath = path.join(STORAGE_DIR, fileName);
  try {
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (!exists) {
      console.log(`File ${filePath} already deleted or doesn't exist`);
      return;
    }
    await fs.unlink(filePath);
    console.log(`File deleted successfully: ${filePath}`);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

// Verificar que el archivo existe
export async function fileExists(fileName: string): Promise<boolean> {
  const filePath = path.join(STORAGE_DIR, fileName);
  return fs.access(filePath).then(() => true).catch(() => false);
}

// Inicializar el directorio de almacenamiento al importar el módulo
ensureStorageDir().catch(console.error);