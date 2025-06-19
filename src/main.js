import { init as initOptions } from './lib/options.js';
import { make as makeEpub } from './lib/epub.js';

const VERSION = "1.1.2";

// Initialize options
initOptions();

// Make the EPUB file
async function main() {
  try {
    await makeEpub();
  } catch (e) {
    console.error('Error creating EPUB:', e.message);
    process.exit(1);
  }
}

main();
