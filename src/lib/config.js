/**
 * Module for handling program configuration
 * @module config
 */

/**
 * Parse configuration from a JSON string
 * @param {string} string - JSON configuration string
 * @returns {Object} - Parsed configuration object
 */
function readConfig(string) {
  const cfg = {};
  
  try {
    const parsedConfig = JSON.parse(string);
    
    Object.entries(parsedConfig).forEach(([k, v]) => {
      // String type settings
      if (['title', 'output', 'lang2', 'langfb', 'source', 'config', 
           'cover', 'style', 'lang1', 'votive', 'horas', 'rubrics', 
           'datefrom', 'dateto', 'numofdays'].includes(k)) {
        cfg[k] = String(v);
      } else {
        // Boolean type settings
        cfg[k] = Boolean(v);
      }
    });
    
    return cfg;
  } catch (e) {
    console.error(`Wrong data in config file:\n${string}`);
    process.exit(1);
  }
}

export { readConfig };
