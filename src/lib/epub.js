import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import { create as xmlbuilder } from 'xmlbuilder2';
import { getFile, getFilePath } from './assets.js';
import * as Options from './options.js';
import * as DivinumOfficium from './do.js';
import JPEG from './jpeg.js';
import * as Reporter from './reporter.js';
import crc32 from 'crc-32';

// Constants
const TMP_DIR = path.join(os.tmpdir(), `${path.basename(process.argv[1])}-tmp-${Math.floor(Date.now() / 1000)}`);
const EXPAND_PAGE = 'expands.html';
const EPUB_IDENTIFIER = uuidv4();

/**
 * Create temporary directory
 */
async function createTmpDir() {
  try {
    await fs.ensureDir(TMP_DIR);
    await fs.ensureDir(path.join(TMP_DIR, 'Text'));
  } catch (e) {
    console.error(`Can't create temporary directory ${TMP_DIR}`);
    process.exit(1);
  }
}

/**
 * Delete temporary directory
 */
async function deleteTmpDir() {
  try {
    await fs.remove(TMP_DIR);
  } catch (e) {
    console.error(`Can't delete temporary directory ${TMP_DIR}: ${e.message}`);
  }
}

/**
 * Generate container.xml
 * @returns {string} - XML content
 */
function containerXml() {
  const xml = xmlbuilder({
    container: {
      '@version': '1.0',
      '@xmlns': 'urn:oasis:names:tc:opendocument:xmlns:container',
      rootfiles: {
        rootfile: {
          '@full-path': 'OEBPS/content.opf',
          '@media-type': 'application/oebps-package+xml'
        }
      }
    }
  });
  
  return xml.end({ prettyPrint: true, indent: '  ' });
}

/**
 * Generate content.opf
 * @param {Object} ordo - Map of dates to content objects with title and content
 * @param {string} exps - Expands content
 * @param {string[]} fonts - Array of font filenames
 * @returns {string} - XML content
 */
function contentOpf(ordo, exps, fonts) {
  const ordoKeys = Object.keys(ordo);
  
  // Build metadata object
  const metadata = {
    '@xmlns:dc': 'http://purl.org/dc/elements/1.1/',
    '@xmlns:opf': 'http://www.idpf.org/2007/opf',
    'dc:identifier': { '@id': 'bookid', '#': EPUB_IDENTIFIER },
    'dc:contributor': { '@opf:role': 'bkp' },
    'dc:date': { '@opf:event': 'creation', '#': new Date().toISOString().split('T')[0] },
    'dc:creator': { '@opf:role': 'aut', '#': 'www.divinumofficium.com' },
    'dc:language': 'la',
    'dc:title': Options.getOpt('title')
  };
  
  // Add cover metadata if needed
  if (!Options.getOpt('nocover')) {
    metadata.meta = { '@name': 'cover', '@content': 'cover' };
  }
  
  // Build manifest items
  const manifestItems = [
    { '@id': 'ncx', '@href': 'toc.ncx', '@media-type': 'application/x-dtbncx+xml' }
  ];
  
  // Add cover if needed
  if (!Options.getOpt('nocover')) {
    manifestItems.push({ '@id': 'cover', '@href': 'images/cover.jpg', '@media-type': 'image/jpeg' });
  }
  
  // Add cover page if needed
  if (!Options.getOpt('nocoverpage')) {
    manifestItems.push({ '@id': 'coverpage', '@href': 'Text/coverpage.html', '@media-type': 'application/xhtml+xml' });
  }
  
  // Add title page if needed
  if (!Options.getOpt('notitlepage')) {
    manifestItems.push({ '@id': 'titlepage', '@href': 'Text/titlepage.html', '@media-type': 'application/xhtml+xml' });
  }
  
  // Add index page if needed
  if (Options.getOpt('index')) {
    manifestItems.push({ '@id': 'indexpage', '@href': 'Text/indexpage.html', '@media-type': 'application/xhtml+xml' });
  }
  
  // Add fonts
  fonts.forEach(font => {
    const extension = path.extname(font).substring(1);
    manifestItems.push({
      '@id': font,
      '@href': `Fonts/${font}`,
      '@media-type': `font/${extension}`
    });
  });
  
  // Add stylesheet
  manifestItems.push({ '@id': 'style', '@href': 'css/style.css', '@media-type': 'text/css' });
  
  // Add content pages
  ordoKeys.forEach((key, index) => {
    manifestItems.push({
      '@id': `B${index + 1}`,
      '@href': `Text/${key}.html`,
      '@media-type': 'application/xhtml+xml'
    });
  });
  
  // Add expands page if needed
  if (exps && exps.length > 0) {
    manifestItems.push({
      '@id': 'expandspage',
      '@href': 'Text/expands.html',
      '@media-type': 'application/xhtml+xml'
    });
  }
  
  // Build spine items
  const spineItems = [];
  
  // Add cover page to spine if needed
  if (!Options.getOpt('nocoverpage')) {
    spineItems.push({ '@idref': 'coverpage' });
  }
  
  // Add title page to spine if needed
  if (!Options.getOpt('notitlepage')) {
    spineItems.push({ '@idref': 'titlepage' });
  }
  
  // Add index page to spine if needed
  if (Options.getOpt('index')) {
    spineItems.push({ '@idref': 'indexpage' });
  }
  
  // Add content pages to spine
  ordoKeys.forEach((_, index) => {
    spineItems.push({ '@idref': `B${index + 1}` });
  });
  
  // Add expands page to spine if needed
  if (exps && exps.length > 0) {
    spineItems.push({ '@idref': 'expandspage' });
  }
  
  // Build guide if needed
  let guide = null;
  if (!Options.getOpt('nocoverpage')) {
    guide = {
      reference: {
        '@type': 'cover',
        '@title': 'Cover',
        '@href': 'Text/coverpage.html'
      }
    };
  }
  
  // Build complete content.opf object
  const contentObj = {
    package: {
      '@xmlns': 'http://www.idpf.org/2007/opf',
      '@unique-identifier': 'bookid',
      '@version': '2.0',
      metadata,
      manifest: { item: manifestItems },
      spine: { '@toc': 'ncx', itemref: spineItems }
    }
  };
  
  // Add guide if needed
  if (guide) {
    contentObj.package.guide = guide;
  }
  
  const xml = xmlbuilder(contentObj);
  return xml.end({ prettyPrint: true, indent: '  ' });
}

/**
 * Get array of horas from options
 * @returns {string[]} - Array of horas
 */
function getHoras() {
  // Use Unicode-aware regex to match Crystal behavior
  let horasArr = Options.getOpt('horas').split(/(?=\p{Lu}\p{Ll}+)/u);
  
  if (horasArr[0] === 'Omnes') {
    horasArr = ['Matutinum', 'Laudes', 'Prima', 'Tertia', 'Sexta', 'Nona', 'Vesperae', 'Completorium'];
    
    // Special case for Defunctorum votive
    if (Options.getOpt('votive') === 'Defunctorum') {
      horasArr = ['Matutinum', 'Laudes', 'Vesperae'];
    }
  }
  
  return horasArr;
}

/**
 * Format index entry
 * @param {string} key - Date key  
 * @param {string} value - Title value (now just string, not object)
 * @returns {string} - Formatted entry
 */
function indexEntry(key, value) {
  let text = value;
  
  if (Options.getOpt('votive') === 'Hodie') {
    // Parse date from MM-DD-YYYY format
    const [month, day, year] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    // Format as "Mon D [content]"
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    text = `${monthNames[date.getMonth()]} ${date.getDate()} ${text}`;
  }
  
  return text;
}

/**
 * Generate toc.ncx
 * @param {Object} ordo - Map of dates to title strings (not objects)
 * @param {boolean} hasExpands - Whether expands exist
 * @returns {string} - XML content
 */
function tocNcx(ordo, hasExpands) {
  const ordoEntries = Object.entries(ordo);
  const horas = getHoras();
  
  // Build navPoints array
  const navPoints = [];
  let playOrder = 1;
  
  // Add cover page navPoint if needed
  if (!Options.getOpt('nocoverpage')) {
    navPoints.push({
      '@id': `navPoint-${playOrder}`,
      '@playOrder': playOrder++,
      navLabel: {
        text: 'Cover page'
      },
      content: {
        '@src': 'Text/coverpage.html'
      }
    });
  }
  
  // Add title page navPoint if needed
  if (!Options.getOpt('notitlepage')) {
    navPoints.push({
      '@id': `navPoint-${playOrder}`,
      '@playOrder': playOrder++,
      navLabel: {
        text: 'Title page'
      },
      content: {
        '@src': 'Text/titlepage.html'
      }
    });
  }
  
  // Add index page navPoint if needed
  if (Options.getOpt('index')) {
    navPoints.push({
      '@id': `navPoint-${playOrder}`,
      '@playOrder': playOrder++,
      navLabel: {
        text: 'Table of contents'
      },
      content: {
        '@src': 'Text/indexpage.html'
      }
    });
  }
  
  // Add content navPoints - value is now just the title string
  ordoEntries.forEach(([key, value]) => {
    const dayNavPoint = {
      '@id': `navPoint-${playOrder}`,
      '@playOrder': playOrder++,
      navLabel: {
        text: indexEntry(key, value) // value is now just the title string
      },
      content: {
        '@src': `Text/${key}.html`
      },
      navPoint: []
    };
    
    // Add hora navPoints
    horas.forEach(hora => {
      dayNavPoint.navPoint.push({
        '@id': `navPoint-${playOrder}`,
        '@playOrder': playOrder++,
        navLabel: {
          text: hora
        },
        content: {
          '@src': `Text/${key}.html#${hora}`
        }
      });
    });
    
    navPoints.push(dayNavPoint);
  });
  
  // Add expands navPoint if needed
  if (hasExpands) {
    navPoints.push({
      '@id': `navPoint-${playOrder}`,
      '@playOrder': playOrder++,
      navLabel: {
        text: 'Orationes'
      },
      content: {
        '@src': 'Text/expands.html'
      }
    });
  }
  
  // Build complete toc.ncx object
  const tocObj = {
    ncx: {
      '@xmlns': 'http://www.daisy.org/z3986/2005/ncx/',
      '@version': '2005-1',
      head: {
        meta: [
          { '@name': 'dtb:uid', '@content': EPUB_IDENTIFIER },
          { '@name': 'dtb:depth', '@content': '2' },
          { '@name': 'dtb:totalPageCount', '@content': '-1' },
          { '@name': 'dtb:maxPageNumber', '@content': '-1' }
        ]
      },
      docTitle: {
        text: Options.getOpt('title')
      },
      navMap: {
        navPoint: navPoints
      }
    }
  };
  
  const xml = xmlbuilder(tocObj);
  return xml.end({ prettyPrint: true, indent: '  ' });
}

/**
 * Create HTML page template
 * @param {string} title - Page title
 * @param {Function} bodyContent - Function to generate body content
 * @returns {string} - HTML content
 */
function htmlPage(title, bodyContent = '') {
  const html = {
    'html': {
      '@xmlns': 'http://www.w3.org/1999/xhtml',
      'head': {
        'title': title,
        'link': {
          '@href': '../css/style.css',
          '@rel': 'stylesheet',
          '@type': 'text/css'
        }
      },
      'body': typeof bodyContent === 'function' ? bodyContent() : bodyContent
    }
  };

  const xml = xmlbuilder(html).end({ prettyPrint: true, indent: '  ' });
  const xmlDecl = '<?xml version="1.0" encoding="UTF-8"?>';
  const doctype = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">';
  return `${xmlDecl}\n${doctype}\n${xml}`;
}

/**
 * Generate index page
 * @param {Object} ordo - Map of dates to title strings (not objects)
 * @returns {string} - HTML content
 */
function indexPage(ordo) {
  const horas = getHoras();
  
  const bodyContent = () => {
    return {
      'h2': 'Table of Contents',
      'ul': {
        'li': Object.entries(ordo).map(([key, value]) => {
          return {
            '@class': 'toc-day text-sm',
            'a': {
              '@href': `${key}.html`,
              '#': indexEntry(key, value) // value is now just the title string
            },
            'ul': {
              'li': horas.map(hora => {
                return {
                  '@class': 'toc-hora',
                  'a': {
                    '@href': `${key}.html#${hora}`,
                    '#': `[ ${hora.substring(0, 3)} ]`
                  }
                };
              })
            }
          };
        })
      }
    };
  };
  
  return htmlPage('Table of contents', bodyContent);
}

/**
 * Generate expands page
 * @param {string} exps - Expands content
 * @returns {string} - HTML content
 */
function expandsPage(exps) {
  const page = htmlPage('Orationes');
  return page.replace(/<body><\/body>/, `<body>${exps}</body>`);
}

/**
 * Generate title page
 * @param {Object} ordo - Map of dates to content
 * @returns {string} - HTML content
 */
function titlePage(ordo) {
  const ordoKeys = Object.keys(ordo);
  
  const bodyContent = () => {
    const content = {
      'h1': Options.getOpt('title'),
      'h2': Options.getOpt('rubrics').replace(/\+/g, ' '),
      'p': [
        {
          '@class': 'center',
          '@style': 'padding-top: 10%',
          '#': `${Options.getOpt('lang1')}${Options.getOpt('lang1') !== Options.getOpt('lang2') ? ` / ${Options.getOpt('lang2').replace(/\/.*/, '')}` : ''}`
        }
      ]
    };
    
    // Add date range if not Defunctorum
    if (Options.getOpt('votive') !== 'Defunctorum') {
      content.p.push({
        '@class': 'center',
        '#': `${ordoKeys[0]} – ${ordoKeys[ordoKeys.length - 1]}`
      });
    }
    
    // Add website
    content.p.push({
      '@class': 'center text-sm',
      '@style': 'padding-top: 30%',
      '#': 'https://www.divinumofficium.com'
    });
    
    return content;
  };
  
  return htmlPage('Title page', bodyContent);
}

/**
 * Generate cover page
 * @returns {string} - HTML content
 */
async function coverPage() {
  try {
    const coverFile = await resolveFilePath('cover');
    const coverBuffer = await fs.readFile(coverFile);
    const [width, height] = await JPEG.getWidthAndHeight(coverBuffer);
    
    const bodyContent = () => {
      return {
        'div': {
          '@style': 'text-align: center; padding: 0pt; margin: 0pt;',
          'svg': {
            '@xmlns': 'http://www.w3.org/2000/svg',
            '@height': '100%',
            '@preserveAspectRatio': 'xMidYMid meet',
            '@version': '1.1',
            '@viewBox': `0 0 ${width} ${height}`,
            '@width': '100%',
            '@xmlns:xlink': 'http://www.w3.org/1999/xlink',
            'image': {
              '@width': width.toString(),
              '@height': height.toString(),
              '@xlink:href': '../images/cover.jpg'
            }
          }
        }
      };
    };
    
    return htmlPage('Cover page', bodyContent);
  } catch (e) {
    console.error(`Cover error: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Get file content
 * @param {string} name - File name
 * @returns {Promise<Buffer>} - File content
 */
async function readFile(name) {
  const file = await resolveFilePath(name);
  return await fs.readFile(file);
}

/**
 * Get file path
 * @param {string} name - File name
 * @returns {Promise<string>} - File path
 */
async function resolveFilePath(name) {
  const file = Options.getOpt(name);
  
  if (file) {
    try {
      await fs.access(file, fs.constants.R_OK);
      return file;
    } catch (e) {
      console.error(`Can't read ${name} file ${file}`);
      throw e;
    }
  } else {
    if (name === 'cover') {
      return getFilePath('cover.jpg');
    } else if (name === 'style') {
      return getFilePath('style.css');
    } else {
      throw new Error(`Internal error wrong name = ${name}`);
    }
  }
}

/**
 * Add mimetype file to archive
 * @param {archiver} archive - Archive instance
 */
function addMimetype(archive) {
  const mimetypeText = 'application/epub+zip';
  const mimetypeEntry = {
    name: 'mimetype',
    store: true, // No compression
    // Calculate CRC32 for mimetype using imported crc32
    crc32: crc32.buf(new TextEncoder().encode(mimetypeText)) >>> 0
  };
  archive.append(mimetypeText, mimetypeEntry);
}

/**
 * Build EPUB file
 */
async function make() {
  const fonts = [];
  
  try {
    Reporter.report('Building epub');
    
    // Create temporary directory first
    await createTmpDir();
    
    // Set up cleanup on exit
    process.on('exit', () => {
      deleteTmpDir().catch(console.error);
    });
    
    const output = fs.createWriteStream(Options.getOpt('output'));
    const archive = archiver('zip', { 
      zlib: { level: 9 },
      store: false,
      threshold: 1024 * 1024 // 1MB chunks
    });
    
    // Set up event listeners
    output.on('close', () => {
      Reporter.report(`Epub saved as ${Options.getOpt('output')}`);
      if (!Options.getOpt('quiet')) {
        console.log('');
      }
    });
    
    archive.on('error', (err) => {
      throw err;
    });

    // Add warning listener for memory issues
    archive.on('warning', (err) => {
      if (err.code === 'ENOMEM') {
        console.error('Memory warning:', err.message);
        global.gc && global.gc();
      }
    });
    
    // Pipe archive to output
    archive.pipe(output);
    
    // Add mimetype file (must be first and uncompressed)
    addMimetype(archive);
    
    // Add container.xml
    archive.append(containerXml(), { name: 'META-INF/container.xml' });
    
    // Add CSS
    const styleContent = await fs.readFile(await resolveFilePath('style'));
    archive.append(styleContent, { name: 'OEBPS/css/style.css' });
    
    // Add cover image if needed
    if (!Options.getOpt('nocover')) {
      const coverContent = await fs.readFile(await resolveFilePath('cover'));
      archive.append(coverContent, { name: 'OEBPS/images/cover.jpg' });
    }
    
    // Add cover page if needed
    if (!Options.getOpt('nocoverpage')) {
      const coverPageContent = await coverPage();
      archive.append(coverPageContent, { name: 'OEBPS/Text/coverpage.html' });
    }
    
    // Add fonts if specified
    if (Options.getOpt('fontdir')) {
      const fontDir = Options.getOpt('fontdir');
      const fontFiles = await fs.readdir(fontDir);
      
      for (const font of fontFiles) {
        fonts.push(font);
        const fontPath = path.join(fontDir, font);
        const fontContent = await fs.readFile(fontPath);
        archive.append(fontContent, { name: `OEBPS/Fonts/${font}` });
      }
    }
    
    // Download content
    const ordo = await DivinumOfficium.downloadHoras();
    const exps = await DivinumOfficium.downloadExpands();
    
    // Add content.opf
    archive.append(contentOpf(ordo, exps, fonts), { name: 'OEBPS/content.opf' });
    
    // Add toc.ncx
    archive.append(tocNcx(ordo, exps.length > 0), { name: 'OEBPS/toc.ncx' });
    
    // Add index page if needed
    if (Options.getOpt('index')) {
      archive.append(indexPage(ordo), { name: 'OEBPS/Text/indexpage.html' });
    }
    
    // Add title page if needed
    if (!Options.getOpt('notitlepage')) {
      archive.append(titlePage(ordo), { name: 'OEBPS/Text/titlepage.html' });
    }
    
    // Add content pages - read from files written by prepareHoras (matching Crystal)
    for (const dateKey of Object.keys(ordo)) {
      const contentPath = path.join(TMP_DIR, 'Text', `${dateKey}.html`);
      try {
        const content = await fs.readFile(contentPath);
        archive.append(content, { name: `OEBPS/Text/${dateKey}.html` });
      } catch (e) {
        console.error(`Error reading content file for ${dateKey}: ${e.message}`);
        throw e;
      }
    }
    
    // Add expands page if needed
    if (exps.length > 0) {
      const expandsContent = expandsPage(exps);
      archive.append(expandsContent, { name: 'OEBPS/Text/expands.html' });
    }
    
    // Finalize archive
    await archive.finalize();
  } catch (e) {
    console.error(`Can't write output to ${Options.getOpt('output')}: ${e.message}`);
    process.exit(1);
  } finally {
    // Clean up temporary directory
    await deleteTmpDir();
  }
}

export { make, TMP_DIR, createTmpDir, deleteTmpDir };
