import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

async function main() {
  const filePath = 'C:/Users/Windows 10/Downloads/NET4LIFE 100k.pdf';
  if (!fs.existsSync(filePath)) {
    console.log('NET4LIFE 100k.pdf não encontrado');
    return;
  }
  const bytes = fs.readFileSync(filePath);
  console.log('Tamanho NET4LIFE 100k.pdf:', bytes.length);
  const doc = await PDFDocument.load(bytes);
  console.log('Páginas:', doc.getPageCount());
}

main().catch(console.error);
