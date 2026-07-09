import { wixListCollections, wixGetCollectionSchema, wixQueryItems } from '../src/lib/wix-client';

async function main() {
  console.log('Fetching collections FORMULARIOHOMESITE, Usuarios, Import1...');
  
  for (const id of ['FORMULARIOHOMESITE', 'Usuarios', 'Import1']) {
    console.log(`\n--- Collection: ${id} ---`);
    const schema = await wixGetCollectionSchema(id);
    console.log('Schema fields:', Object.keys(schema?.fields || {}));
    const items = await wixQueryItems(id, 1);
    if (items?.dataItems && items.dataItems.length > 0) {
      console.log('Sample item JSON:', JSON.stringify(items.dataItems[0], null, 2));
    } else {
      console.log('No items found.');
    }
  }
}

main().catch(console.error);
