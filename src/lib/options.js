import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFile } from './assets.js';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const DO_DATEFORMAT = '%m-%d-%Y';
const DO_WPATH = '/cgi-bin/horas/';
const DO_LPATH = '/web' + DO_WPATH;

let opts = {};
let doOpts = {};

/**
 * Abort with error message
 * @param {string} message - Error message to display
 */
function abort(message) {
  console.error(message);
  process.exit(1);
}

/**
 * Check if a date string is valid
 * @param {string} name - Name of the option
 * @param {Date} today - Today's date
 * @returns {Date} - Parsed date
 */
function checkDate(name, today) {
  try {
    let value = opts[name].trim();
    
    // Handle MM-DD format by adding current year
    if (/^\d\d?[-/]\d\d?$/.test(value)) {
      value += '/' + today.getFullYear();
    }
    
    // Replace / with -
    value = value.replace(/\//g, '-');
    
    // Parse the date using DO_DATEFORMAT
    const [month, day, year] = value.split('-').map(Number);
    if (isNaN(month) || isNaN(day) || isNaN(year)) {
      throw new Error('Invalid date format');
    }
    
    const date = new Date(year, month - 1, day);
    if (date.toString() === 'Invalid Date') {
      throw new Error('Invalid date');
    }
    
    // Ensure we return a proper Date object
    return new Date(date.getTime());
  } catch (e) {
    abort(`Wrong ${name} date: ${opts[name]} (expected format: ${DO_DATEFORMAT})`);
  }
}

/**
 * Check source URL/path
 * @param {string} source - Source URL/path
 * @returns {string} - Updated source
 */
function checkSource(source) {
  try {
    const url = new URL(source);
    if (url.protocol) {
      if (url.pathname) {
        return source + DO_WPATH;
      }
      return source;
    }
  } catch (e) {
    // Not a URL, treat as a filesystem path
    try {
      if (fs.existsSync(source + DO_LPATH) && 
          fs.statSync(source + DO_LPATH).isReadable()) {
        return source + DO_LPATH;
      }
      abort(`Can't locate ${DO_LPATH} in ${source}`);
    } catch (e) {
      abort(`Source path error: ${e.message}`);
    }
  }
  return source;
}

/**
 * Find unequivocal match in array
 * @param {string[]} array - Array to search in
 * @param {string} value - Value to search for
 * @returns {string|boolean} - Matched string or false
 */
function unequivocal(array, value) {
  let r = array.filter(x => new RegExp(value).test(x));
  
  if (r.length === 1) {
    return r[0];
  }
  
  r = array.filter(x => x === value);
  
  if (r.length === 1) {
    return r[0];
  }
  
  if (r.length > 1) {
    console.log(`ambiguous *${value}* match ${r.join(' and ')}`);
  }
  
  return false;
}

/**
 * Check horas option
 * @returns {string} - Joined horas string
 */
function checkHoras() {
  const a = [];
  // Use Unicode-aware regex to match Crystal behavior
  const horasArr = opts.horas.split(/(?=\p{Lu}\p{Ll}*)/u);
  
  for (const i of horasArr) {
    const o = unequivocal(doOpts.HORAS, i);
    if (!o) {
      abort(`Horas must be one of: ${doOpts.HORAS.join(' | ')}`);
    }
    a.push(o);
  }
  
  return a.join('');
}

/**
 * Check all options for validity
 */
function checkOptions() {
  // Check config file
  if (opts.config) {
    if (!fs.existsSync(opts.config) || !fs.statSync(opts.config).isFile()) {
      abort(`Can't read config file ${opts.config}`);
    } else {
      try {
        const configData = YAML.parse(fs.readFileSync(opts.config, 'utf8'));
        // Validate config data types
        for (const [k, v] of Object.entries(configData)) {
          if (['title', 'output', 'lang2', 'langfb', 'source', 'config', 'cover', 
               'style', 'lang1', 'votive', 'horas', 'rubrics', 'datefrom', 
               'dateto', 'numofdays', 'fontdir'].includes(k)) {
            if (typeof v !== 'string') {
              abort(`Invalid type for config option ${k}: expected string`);
            }
          } else {
            if (typeof v !== 'boolean') {
              abort(`Invalid type for config option ${k}: expected boolean`);
            }
          }
        }
        opts = { ...opts, ...configData };
      } catch (e) {
        abort(`Error reading config file: ${e.message}`);
      }
    }
  }
  
  // Check source
  opts.source = checkSource(opts.source);
  
  // Load DO options
  loadDoOptions();
  
  // Check style file
  if (opts.style && (!fs.existsSync(opts.style) || !fs.statSync(opts.style).isFile())) {
    abort(`Can't read style file ${opts.style}`);
  }
  
  // Check cover file
  if (opts.cover && (!fs.existsSync(opts.cover) || !fs.statSync(opts.cover).isFile())) {
    abort(`Can't read cover file ${opts.cover}`);
  }
  
  // Check font directory
  if (opts.fontdir && (!fs.existsSync(opts.fontdir) || !fs.statSync(opts.fontdir).isDirectory())) {
    abort(`Can't read font directory ${opts.fontdir}`);
  }
  
  // Check output file
  if (!opts.overwrite && fs.existsSync(opts.output)) {
    abort(`Output file ${opts.output} already exists. Change --output or use --overwrite`);
  }
  
  // Check votive option
  opts.votive = unequivocal(doOpts.VOTIVES, opts.votive);
  if (!opts.votive) {
    abort(`Votive must be one of: ${doOpts.VOTIVES.join(' | ')}`);
  }
  
  // Check rubrics option
  opts.rubrics = unequivocal(doOpts.RUBRICS, opts.rubrics);
  if (!opts.rubrics) {
    abort(`Rubrics must be one of: ${doOpts.RUBRICS.join(' | ')}`);
  }
  
  // Check lang2 option
  opts.lang2 = unequivocal(doOpts.LANGUAGES, opts.lang2);
  if (!opts.lang2) {
    abort(`Lang2 must be one of: ${doOpts.LANGUAGES.join(' | ')}`);
  }
  
  // Check langfb option
  opts.langfb = unequivocal(doOpts.LANGUAGES, opts.langfb);
  if (!opts.langfb) {
    abort(`Langfb must be one of: ${doOpts.LANGUAGES.join(' | ')}`);
  }
  
  // Set nocoverpage if nocover is true
  if (opts.nocover) {
    opts.nocoverpage = true;
  }
  
  // Set title
  if (opts.votive !== 'Hodie') {
    opts.title = `Officium ${opts.votive.replace(/\/.*/, '')}`;
  }
  
  // Check horas
  opts.horas = checkHoras();
  
  // Handle dates
  const today = new Date();
  console.log('Initial date values:', {
    datefrom: opts.datefrom,
    dateto: opts.dateto,
    today: today
  });
  
  if (opts.datefrom) {
    console.log('Converting datefrom:', opts.datefrom);
    opts.datefrom = checkDate('datefrom', today);
    console.log('Converted datefrom:', opts.datefrom);
  } else {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    opts.datefrom = new Date(tomorrow.getTime());
    console.log('Set default datefrom:', opts.datefrom);
  }
  
  if (opts.dateto) {
    console.log('Converting dateto:', opts.dateto);
    opts.dateto = checkDate('dateto', today);
    console.log('Converted dateto:', opts.dateto);
  } else {
    const lastDay = new Date(opts.datefrom.getFullYear(), opts.datefrom.getMonth() + 1, 0);
    opts.dateto = new Date(lastDay.getTime());
    console.log('Set default dateto:', opts.dateto);
  }
  
  if (opts.numofdays) {
    console.log('Setting dateto based on numofdays:', opts.numofdays);
    const endDate = new Date(opts.datefrom);
    endDate.setDate(endDate.getDate() + parseInt(opts.numofdays, 10) - 1);
    opts.dateto = new Date(endDate.getTime());
    console.log('Set dateto from numofdays:', opts.dateto);
  }

  console.log('Final date values:', {
    datefrom: {
      value: opts.datefrom,
      type: typeof opts.datefrom,
      isDate: opts.datefrom instanceof Date,
      constructor: opts.datefrom?.constructor?.name
    },
    dateto: {
      value: opts.dateto,
      type: typeof opts.dateto,
      isDate: opts.dateto instanceof Date,
      constructor: opts.dateto?.constructor?.name
    }
  });
}

/**
 * Load divinum officium options
 */
function loadDoOptions() {
  let data;
  const src = opts.source;
  
  if (/^https?:\/\//.test(src)) {
    data = getFile('horas.dialog');
  } else {
    try {
      data = fs.readFileSync(src + '../../www/horas/horas.dialog', 'utf8');
    } catch (e) {
      abort(`Can't locate horas.dialog in ${opts.source}`);
    }
  }
  
  // Ensure data is a string
  if (Buffer.isBuffer(data)) data = data.toString();
  
  // Parse the data
  ['versions', 'languages', 'votives', 'horas'].forEach(o => {
    const upperOpt = o.toUpperCase();
    const regex = new RegExp(`\\[${o}\\].(.*?)\\n\\n`, 's');
    const match = data.match(regex);
    
    if (match && match[1]) {
      doOpts[upperOpt] = match[1].split(',');
    } else {
      doOpts[upperOpt] = [];
    }
  });
  
  // Create RUBRICS from VERSIONS
  doOpts.RUBRICS = doOpts.VERSIONS.map(x => x.replace(/\/.*/, ''));
  delete doOpts.VERSIONS;
  
  // Add 'Omnes' to HORAS
  doOpts.HORAS.push('Omnes');
}

/**
 * Initialize options from command line and config
 */
export function init() {
  // Set default options
  opts = YAML.parse(getFile('config').toString());
  opts.lang1 = 'Latin';
  
  // Load default DO options before parsing command line
  loadDoOptions();
  
  // Parse command line options
  const program = new Command();
  
  program
    .name(path.basename(process.argv[1]))
    .description('Generate EPUB files from divinumofficium.com')
    .version(program.version);
  
  program.addHelpText('before', `Usage: ${path.basename(process.argv[1])} <arguments>
  default values in []
  possible values in ()`);
  
  // Divinum officium options
  program.addHelpText('before', '\nDivinum officium options:');
  
  program
    .option('-r, --rubrics <RUBRICS>', `rubrics ${doOpts.RUBRICS.join(' | ')} [${opts.rubrics}]`)
    .option('-f, --datefrom <DATE>', 'start date MM-DD-YYYY [\'tomorrow\']')
    .option('-t, --dateto <DATE>', 'end date MM-DD-YYYY [\'end of month of start date\']')
    .option('-n, --numofdays <NUMBER>', 'give number of days instead of above - no defaults')
    .option('-H, --horas <HORAS>', 'string consist horas ex. \'VesperaeCompletorium\' [' + opts.horas + ']')
    .option('-l, --lang2 <LANGUAGE>', `language for right side ${doOpts.LANGUAGES.join(' | ')} [${opts.lang2}]`)
    .option('-b, --langfb <LANGUAGE>', `fallback language for missing translation ${doOpts.LANGUAGES.join(' | ')} [${opts.langfb}]`)
    .option('-e, --votive <VOTIVE>', `${doOpts.VOTIVES.join(' | ')} [${opts.votive}]`)
    .option('--priest', 'priest mode')
    .option('--oldhymns', 'use pre Urban VII hymns')
    .option('--nonumbers', 'do not number verses in psalms, canticles, biblical reading')
    .option('--noexpand', 'do not expand common prayes')
    .option('--nofancychars', 'use + for crosses, VR for ℣℟')
    .option('--nosplit', 'do not split sentences into separate rows');
  
  // Program options
  program.addHelpText('before', '\nProgram options:');
  
  program
    .option('-o, --output <FILE>', 'epub file name [' + opts.output + ']')
    .option('--overwrite', 'overwrite output file')
    .option('-i, --title <TITLE>', 'book title [' + opts.title + ']')
    .option('--nocover', 'do not include cover')
    .option('--nocoverpage', 'do not insert cover page')
    .option('-k, --cover <COVERFILE>', 'cover image file')
    .option('--notitlepage', 'do not insert title page')
    .option('--index', 'insert index page')
    .option('--antepost', 'insert page with Apéri & Sacrosánctæ')
    .option('--nocomments', 'omit comments')
    .option('--noomitted', 'omit omitted')
    .option('-s, --style <CSSFILE>', 'style sheet file')
    .option('-S, --dumpcss', 'show internal css style')
    .option('-d, --fontdir <DIR>', 'include fonts from directory')
    .option('-p, --source <SOURCE>', `path/url to divinum officium in place of ${opts.source}`)
    .option('-c, --config <CFGFILE>', 'read options from file')
    .option('-C, --dumpconfig', 'show default configuration')
    .option('-q, --quiet', 'do not report progress');
  
  program.parse(process.argv);
  
  // Get options from command line
  const options = program.opts();
  
  // Handle special cases
  if (options.dumpcss) {
    console.log(getFile('style.css'));
    process.exit(0);
  }
  
  if (options.dumpconfig) {
    console.log(getFile('config'));
    process.exit(0);
  }
  
  // Merge options
  opts = { ...opts, ...options };
  
  // Check options
  checkOptions();
}

/**
 * Get option value
 * @param {string} opt - Option name
 * @returns {any} - Option value or undefined
 */
export function getOpt(opt) {
  return opts[opt];
}

/**
 * Get DO option value
 * @param {string} opt - DO option name
 * @returns {string[]} - DO option values
 */
export function getDoOpt(opt) {
  return doOpts[opt] || [];
}
