/**
 * Module for handling static assets
 * @module assets
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path where this file is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Assets directory is located in the parent directory of src
const ASSETS_DIR = path.resolve(__dirname, '../../assets');

/**
 * Get a file from the assets directory
 * @param {string} name - File name to retrieve
 * @returns {Buffer|string} - File content
 */
function getFile(name) {
  try {
    const filePath = path.join(ASSETS_DIR, name);
    return fs.readFileSync(filePath);
  } catch (error) {
    console.error(`Internal file ${name} is missing!`);
    process.exit(1);
  }
}

function getFilePath(name) {
  return path.join(ASSETS_DIR, name);
}

export { getFile, getFilePath };
