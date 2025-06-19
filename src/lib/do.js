import fetch from 'node-fetch';
import { exec } from 'child_process';
import util from 'util';
import * as Options from './options.js';
import * as Horas from './horas.js';
import * as Epub from './epub.js';
import * as Reporter from './reporter.js';
import * as Lexbor from './mylexbor.js';
import fs from 'fs-extra';
import path from 'path';
import { JSDOM } from 'jsdom';
import { TMP_DIR, createTmpDir, deleteTmpDir } from './epub.js';
import { cleanHtml } from './horas.js';
import { getOpt } from './options.js';
import { clearExpands } from './mylexbor.js';

// Convert exec to promise-based version for async/await
const execPromise = util.promisify(exec);

/**
 * Get content from a source with options string
 * @param {string} source - Source URL or command
 * @param {string} optstring - Options as a query string
 * @returns {string} - Response body
 */
async function get(source, optstring) {
  try {
    // Check if source is a URL
    const regex = /^(?:(https?):\/\/)([^/]*)\/(.*)/;
    const match = source.match(regex);
    
    if (match) {
      // Handle URL case
      const headers = {
        'User-Agent': `divinumofficium.epub/${process.env.npm_package_version || '1.1.2'}`
      };
      
      const response = await fetch(source + "?" + optstring.replace(/ /g, "&"), { headers });
      return await response.text();
    } else {
      // Handle command case
      const { stdout } = await execPromise(`${source} '${optstring}'`);
      return stdout.replace(/^.*?</m, "<");
    }
  } catch (ex) {
    console.error(ex.message);
    process.exit(1);
  }
}

/**
 * Generate options string for Horas
 * @param {string} date - Date string
 * @returns {string} - Options string
 */
function horasOpts(date) {
  const o = [`date=${date}`];
  
  // Add language options
  o.push(`lang1=${Options.getOpt("lang1")}`);
  o.push(`lang2=${Options.getOpt("lang2").replace(/.*\//, "")}`);
  o.push(`langfb=${Options.getOpt("langfb").replace(/.*\//, "")}`);
  
  // Add boolean options - match Crystal order
  ['priest', 'oldhymns', 'nonumbers', 'nofancychars'].forEach(a => {
    if (Options.getOpt(a)) {
      o.push(`${a}=1`);
    }
  });
  
  // Add version and command
  o.push(`version=${Options.getOpt("rubrics")}`);
  o.push(`command=pray${Options.getOpt("horas")}`);
  
  // Handle votive option
  if (Options.getOpt("votive") !== "Hodie") {
    o.push(`votive=C${Options.getOpt("votive").replace(/.*\//, "")}`);
  }
  
  // Handle expand option - note Crystal uses expand=psalteria for noexpand=true
  if (Options.getOpt("noexpand")) {
    o.push("expand=psalteria");
  }
  
  return o.join("&");
}

/**
 * Generate options string for popup
 * @param {string} item - Item ID
 * @returns {string} - Options string
 */
function popupOpts(item) {
  item = item.replace(/^&/, "\\&");
  
  const o = [`popup=${item}`];
  
  // Format date as MM/DD/YYYY
  const dateTo = Options.getOpt("dateto");
  const dateStr = `${dateTo.getMonth() + 1}/${dateTo.getDate()}/${dateTo.getFullYear()}`;
  
  o.push(`date=${dateStr}`);
  o.push(`lang1=${Options.getOpt("lang1")}`);
  o.push(`lang2=${Options.getOpt("lang2").replace(/.*\//, "")}`);
  o.push(`version=${Options.getOpt("rubrics")}`);
  
  if (Options.getOpt("priest")) {
    o.push("priest=1");
  }
  
  return o.join("&");
}

/**
 * Get Horas content for a date
 * @param {string} date - Date string
 * @returns {Promise<string>} - Horas content
 */
async function getHoras(date) {
  return await get(`${Options.getOpt("source")}officium.pl`, horasOpts(date));
}

/**
 * Get popup content for an item
 * @param {string} item - Item ID
 * @returns {Promise<string>} - Popup content
 */
async function getPopup(item) {
  return await get(`${Options.getOpt("source")}popup.pl`, popupOpts(item));
}

/**
 * Download Horas for date range
 * @returns {Promise<Object>} - Map of dates to title strings (like Crystal version)
 */
async function downloadHoras() {
  const datefrom = Options.getOpt("datefrom");
  const dateto = Options.getOpt("dateto");
  
  if (datefrom > dateto) {
    console.error(`Start date ${datefrom.toLocaleDateString()} greater than end date ${dateto.toLocaleDateString()}`);
    process.exit(1);
  }

  // Create temp directory (matching Crystal behavior)
  await createTmpDir();
  
  // Setup cleanup on exit
  process.on('exit', async () => {
    try {
      await deleteTmpDir();
    } catch (e) {
      console.error('Error cleaning up temp directory:', e.message);
    }
  });

  const ordo = {};
  
  // Process each date independently (no global deduplication)
  for (let current = new Date(datefrom); current <= dateto; current.setDate(current.getDate() + 1)) {
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const year = current.getFullYear();
    const dateStr = `${month}-${day}-${year}`;
    
    Reporter.report(`Downloading ${dateStr}`);
    
    // Clear expands array for each date to prevent accumulation
    clearExpands();
    
    // Get raw HTML for this date
    const html = await getHoras(dateStr);
    
    // Process the HTML and get the title (matching Crystal's prepare_horas behavior)
    const title = await Horas.prepareHoras(html, dateStr);
    
    // Store only the title in ordo (like Crystal version)
    ordo[dateStr] = title;
    
    // Break after first iteration unless votive is "Hodie"
    if (Options.getOpt("votive") !== "Hodie") {
      break;
    }
  }
  
  return ordo;
}

/**
 * Download expands for prayers
 * @returns {Promise<string>} - Joined expand content
 */
async function downloadExpands() {
  Reporter.report("Downloading expands");
  
  // Clear any existing expands first
  clearExpands();
  
  const expands = await Lexbor.getExpands();
  
  // Add $Ante and $Post for certain rubrics and ensure uniqueness
  if (Options.getOpt("rubrics").match(/Divino|1910/) || Options.getOpt("antepost")) {
    expands.unshift("$Ante", "$Post");
    // Remove duplicates using Set
    const uniqueExpands = [...new Set(expands)];
    expands.length = 0;
    expands.push(...uniqueExpands);
  }
  
  // Download and prepare each expand in parallel
  const expandContents = await Promise.all(
    expands.map(async e => {
      const content = await getPopup(e);
      return await Horas.prepareExpand(content, e.substring(1));
    })
  );
  
  return expandContents.join("");
}

export {
  get,
  getHoras,
  getPopup,
  downloadHoras,
  downloadExpands
};
