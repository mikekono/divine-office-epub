/**
 * Module for handling console reporting/output
 * @module reporter
 */

import { getOpt } from './options.js';

// Track the length of the last message for proper overwriting
let lastLength = 0;

/**
 * Report a status message to the console
 * @param {string} message - Message to report
 */
function report(message) {
  if (getOpt("quiet")) return;
  
  // Create a blank string of the same length as the last message
  const blank = ' '.repeat(lastLength);
  
  // Clear the line with spaces, then return to start and print new message
  process.stdout.write(`\r${blank}\r${message}`);
  
  // Remember length for next time
  lastLength = message.length;
}

export { report };
