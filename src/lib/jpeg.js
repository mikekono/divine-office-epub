/**
 * Module for handling JPEG image information
 * @module jpeg
 * 
 * Based on https://stackoverflow.com/questions/2450906/is-there-a-simple-way-to-get-image-dimensions-in-ruby
 */

/**
 * JPEG image handling functions
 */
const JPEG = {
  /**
   * Get width and height from a JPEG file
   * @param {Buffer} buffer - Buffer containing JPEG data
   * @returns {Array} - Array with [width, height]
   */
  getWidthAndHeight: function(buffer) {
    let offset = 0;
    
    // Check SOI marker
    if (buffer[offset] !== 0xFF || buffer[offset + 1] !== 0xD8) {
      throw new Error("Not JPEG");
    }
    offset += 2;
    
    let width = 0;
    let height = 0;
    
    // Process markers
    while (offset < buffer.length) {
      // Find next marker
      while (buffer[offset] === 0xFF) {
        offset++;
      }
      
      const marker = buffer[offset];
      offset++;
      
      // Check for SOF markers (start of frame)
      if ((marker >= 0xC0 && marker <= 0xC3) || 
          (marker >= 0xC5 && marker <= 0xC7) || 
          (marker >= 0xC9 && marker <= 0xCB) || 
          (marker >= 0xCD && marker <= 0xCF)) {
        
        // Read length (big endian)
        const length = (buffer[offset] << 8) | buffer[offset + 1];
        offset += 2;
        
        // Skip precision byte
        offset++;
        
        // Read height (big endian)
        height = (buffer[offset] << 8) | buffer[offset + 1];
        offset += 2;
        
        // Read width (big endian)
        width = (buffer[offset] << 8) | buffer[offset + 1];
        offset += 2;
        
        // Read components
        const components = buffer[offset];
        
        // Verify length
        if (length !== 8 + components * 3) {
          throw new Error("Malformed JPEG");
        }
        
        break;
      } 
      // EOI or SOS markers - stop processing
      else if (marker === 0xD9 || marker === 0xDA) {
        break;
      } 
      // Other markers - skip data
      else {
        const length = (buffer[offset] << 8) | buffer[offset + 1];
        offset += length;
      }
    }
    
    return [width, height];
  }
};

export default JPEG;
