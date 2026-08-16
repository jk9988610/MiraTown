import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalogFromYaml } from './catalog.js';

export function loadDefaultCatalog() {
  const here = dirname(fileURLToPath(import.meta.url));
  const catalogPath = join(here, '../../../catalog/entities.yaml');
  const yamlText = readFileSync(catalogPath, 'utf8');
  return loadCatalogFromYaml(yamlText);
}
