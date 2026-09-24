import fs from 'fs';
import path from 'path';

function copyAssets() {
  const srcDir = path.join(process.cwd(), 'temp', 'extracted-pdf');
  const destDir = path.join(process.cwd(), 'public', 'images', 'contrato-kev');

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Copia o background da KEV
  if (fs.existsSync(path.join(srcDir, 'img_1_595x841.jpg'))) {
    fs.copyFileSync(path.join(srcDir, 'img_1_595x841.jpg'), path.join(destDir, 'kev-background.jpg'));
    console.log('Copiado kev-background.jpg');
  }

  // Copia o logo da KEV
  if (fs.existsSync(path.join(srcDir, 'img_2_448x96.jpg'))) {
    fs.copyFileSync(path.join(srcDir, 'img_2_448x96.jpg'), path.join(destDir, 'kev-logo.jpg'));
    console.log('Copiado kev-logo.jpg');
  }

  // Copia o logo da DuoLife Hub de Negócios
  if (fs.existsSync(path.join(srcDir, 'img_5_329x205.jpg'))) {
    fs.copyFileSync(path.join(srcDir, 'img_5_329x205.jpg'), path.join(destDir, 'duolife-logo.jpg'));
    console.log('Copiado duolife-logo.jpg');
  }
}

copyAssets();
