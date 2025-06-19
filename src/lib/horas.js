/**
 * Module for handling liturgical hours content
 * @module horas
 */

import { EnhancedDOM, getExpands as getLexborExpands } from './mylexbor.js';
import { getOpt } from './options.js';
import { TMP_DIR } from './epub.js';
import fs from 'fs-extra';
import path from 'path';
import { JSDOM } from 'jsdom';

/**
 * Clean a string by removing/replacing unwanted HTML elements and formatting
 * @param {string} html - HTML content to clean
 * @returns {string} - Cleaned HTML string
 */
function cleanString(html) {
  return html
    .replace(/(<\/?)FONT/gm, "$1span")
    .replace(/(<\/?FORM.*?>\n?)/gm, "")
    .replace(/(?:&nbsp;)+/g, "")
    .replace(/<B><I>(.)<\/I><\/B>/g, "$1")
    .replace(/\s*~\s*/gm, "<BR>")
    .replace(/^\s*\n+/gm, "");
}

/**
 * Clean HTML using various transformations
 * @param {string} html - HTML content to clean
 * @param {string} lang1 - Primary language
 * @param {string} lang2 - Secondary language
 * @returns {string} - Cleaned and transformed HTML
 */
export function cleanHtml(html, lang1, lang2) {
  // Create a fresh DOM instance to avoid any reference issues
  const dom = new EnhancedDOM(html);
  
  // Process in the same order as Crystal version
  dom.removeTags(['style', 'script', 'label', 'select', 'a']);
  dom.divs(lang1, lang2);
  dom.collectExpands();
  dom.cleanBodyTag();
  dom.fontSpans();
  dom.addStyle();
  dom.centerStyle();
  dom.removeH1();
  dom.addIdToHoras();
  dom.fixWrongInitials();
  dom.verseNumbers();
  dom.addHtmlns();
  dom.omitOmitted();
  dom.omitComments();
  
  const cleanedHtml = dom.html();
  
  // Add DOCTYPE declaration
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n${cleanedHtml}`;
}

/**
 * Get expandable sections
 * @returns {Array} - Array of expandable sections
 */
function getExpands() {
  return getLexborExpands();
}

/**
 * Prepare hours content for processing
 * @param {string} html - Source HTML
 * @param {string} date - Date string for the file
 * @returns {Promise<string>} - Title extracted from first paragraph (matching Crystal behavior)
 */
async function prepareHoras(html, date) {
  const lang1 = getOpt("lang1");
  const lang2 = getOpt("lang2");

  // Clean the HTML string first (matching Crystal's clean_string)
  html = cleanString(html);
  
  // Clean and process HTML (matching Crystal's clean_html)
  html = cleanHtml(html, lang1, lang2);

  // Write the processed HTML to temporary file (matching Crystal behavior)
  const filename = path.join(TMP_DIR, 'Text', `${date}.html`);
  
  try {
    await fs.ensureDir(path.dirname(filename));
    await fs.writeFile(filename, html);
  } catch (e) {
    console.error(`Can't write horas to temporary dir: ${e.message}`);
    process.exit(1);
  }

  // Extract and return title from first paragraph (matching Crystal behavior)
  try {
    const dom = new JSDOM(html);
    const firstP = dom.window.document.querySelector('p');
    
    if (firstP && firstP.firstChild) {
      // Get inner HTML of first child, remove <br> and everything after it
      let title = firstP.firstChild.innerHTML || firstP.textContent;
      return title.replace(/<br>.*/, "").trim();
    }
    
    // Fallback if no paragraph found
    return date;
  } catch (e) {
    console.warn(`Could not extract title for ${date}, using date as title`);
    return date;
  }
}

/**
 * Prepare expandable content
 * @param {string} html - Source HTML
 * @param {string} item - Item identifier
 * @returns {string} - Processed HTML for the expandable item
 */
function prepareExpand(html, item) {
  html = cleanString(html);
  html = cleanHtml(html, getOpt("lang1"), getOpt("lang2"));
  
  const dom = new JSDOM(html);
  const body = dom.window.document.querySelector("body");
  
  if (body) {
    const h3 = body.querySelector("h3");
    if (h3) {
      h3.id = item.replace(/ /g, "_");
    }
    
    return body.innerHTML
      .replace(/<br>/g, "<br/>")
      .trim()
      .replace(/<br\/>$/, "");
  }
  
  return "";
}

export { prepareHoras, prepareExpand, getExpands };
