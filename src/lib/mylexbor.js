/**
 * Module for extending HTML parsing functionality (Node.js replacement for Lexbor in Crystal)
 * @module mylexbor
 */

import { JSDOM } from 'jsdom';
import { getOpt, getDoOpt } from './options.js';

// Track expands for later use
let expands = [];

/**
 * Extended DOM Node functionality for HTML parsing
 * Similar to Lexbor::Node in Crystal
 */
class EnhancedDOM {
  constructor(html) {
    this.dom = new JSDOM(html);
    this.document = this.dom.window.document;
  }

  /**
   * Get all elements matching the CSS selector
   * @param {string} selector - CSS selector 
   * @returns {Array} - Array of matching elements
   */
  css(selector) {
    return [...this.document.querySelectorAll(selector)];
  }

  /**
   * Get all elements of a specific tag
   * @param {string} tagName - HTML tag name
   * @returns {Array} - Array of matching elements
   */
  nodes(tagName) {
    return [...this.document.getElementsByTagName(tagName)];
  }

  /**
   * Get the body element
   * @returns {Element} - Body element
   */
  body() {
    return this.document.body;
  }

  /**
   * Get the head element
   * @returns {Element} - Head element
   */
  head() {
    return this.document.head;
  }

  /**
   * Create a new DOM node
   * @param {string} tagName - Tag to create
   * @returns {Element} - Newly created element
   */
  createNode(tagName) {
    return this.document.createElement(tagName);
  }

  /**
   * Add a class to a node
   * @param {Element} node - DOM node
   * @param {string} className - Class to add
   * @returns {Element} - Modified node
   */
  addClass(node, className) {
    if (node.hasAttribute('class')) {
      const classes = node.getAttribute('class').split(/\s+/);
      if (!classes.includes(className)) {
        classes.push(className);
        node.setAttribute('class', classes.join(' '));
      }
    } else {
      node.setAttribute('class', className);
    }
    return node;
  }

  /**
   * Determines the font class based on size value
   * @param {string} v - Font size value
   * @returns {string} - Corresponding CSS class
   */
  fontClass(v) {
    if (v === "1" || v === "82%") {
      return "text-sm";
    } else if (v === "-1") {
      return "text-sm";
    } else if (v === "+1" || v === "1.25em") {
      return "text-lg";
    } else if (v === "+2") {
      return "text-xl";
    } else {
      throw new Error(`Unknown font settings ${v}`);
    }
  }

  /**
   * Process font spans to convert to CSS classes
   * @returns {EnhancedDOM} - The current instance
   */
  fontSpans() {
    this.nodes('span').forEach(f => {
      const classesToAdd = [];

      // Process each attribute
      for (let i = 0; i < f.attributes.length; i++) {
        const attr = f.attributes[i];
        if (attr.name === "style") {
          attr.value.split(/\s*;\s*/).forEach(x => {
            if (x.trim() === '') return;
            
            const [property, value] = x.split(/:/);
            if (!property || !value) {
              throw new Error(`Malformed style attribute: ${x}`);
            }
            
            if (property === "font-size") {
              classesToAdd.push(this.fontClass(value.trim()));
            } else if (property === "color") {
              classesToAdd.push(value.trim());
            } else {
              throw new Error(`Unknown span style ${property}`);
            }
          });
        } else {
          if (/[a-z]+/i.test(attr.value)) {
            classesToAdd.push(attr.value.toLowerCase());
          } else {
            classesToAdd.push(this.fontClass(attr.value));
          }
        }
        f.removeAttribute(attr.name);
        i--; // Adjust for the removed attribute
      }

      // Add all the classes
      classesToAdd.forEach(c => this.addClass(f, c));
    });
    
    return this;
  }

  /**
   * Remove specified tags from the document
   * @param {Array} tags - Array of tag names to remove
   * @returns {EnhancedDOM} - The current instance
   */
  removeTags(tags) {
    tags.forEach(tagName => {
      const elements = [...this.nodes(tagName)];
      elements.forEach(el => el.parentNode.removeChild(el));
    });
    return this;
  }

  /**
   * Check if content is psalm-related and should not be split into sentences
   * @param {string} content - HTML content to check
   * @returns {boolean} - True if content appears to be psalm content
   */
  isPsalmContent(content) {
    if (!content) return false;
    
    // Remove HTML tags for text analysis
    const textContent = content.replace(/<[^>]*>/g, ' ').trim();
    
    // Check for verse numbers (digits at start, often in red small text)
    if (/^\d+\s/.test(textContent)) return true;
    
    // Check for psalm-specific patterns
    if (content.includes('v-numbers')) return true;
    if (content.includes('text-sm red') && /^\d/.test(textContent)) return true;
    
    // Check for typical psalm verse patterns (asterisks, daggers, etc.)
    if (/[*†‡]/.test(textContent)) return true;
    
    // Check for antiphon patterns
    if (/Ant\.|Antiphon/i.test(textContent)) return true;
    
    // Check for psalm numbering patterns
    if (/Psalm\s+\d+/i.test(textContent)) return true;
    
    // Check for typical psalm endings
    if (/Glória Patri|Glory be to the Father/i.test(textContent)) return true;
    
    return false;
  }

  /**
   * Split content into sentences at periods, handling HTML tags properly
   * @param {string} content - HTML content to split
   * @returns {string[]} - Array of sentence fragments
   */
  splitSentences(content) {
    if (!content || !content.trim()) return [];
    
    // Split on periods followed by space and capital letter, or period at end
    const sentences = content.split(/\.\s+(?=[A-Z])|\.(?=\s*$)/).filter(s => s.trim());
    
    // Add periods back to sentences (except the last one if it already ends with period)
    return sentences.map((sentence, index) => {
      const trimmed = sentence.trim();
      if (!trimmed) return '';
      
      // Add period if not already present and not the last sentence
      if (index < sentences.length - 1 && !trimmed.endsWith('.')) {
        return trimmed + '.';
      }
      return trimmed;
    }).filter(s => s.length > 0);
  }

  /**
   * Split content using fuzzy logic to match another language's sentence breaks
   * @param {string} content - Content to split
   * @param {string[]} targetSentences - Target sentences to align with
   * @returns {string[]} - Array of aligned sentence fragments
   */
  splitSentencesFuzzy(content, targetSentences) {
    if (!content || !content.trim()) return [];
    if (!targetSentences || targetSentences.length === 0) {
      return this.splitSentences(content);
    }

    const targetCount = targetSentences.length;
    
    // If only one target sentence, return as is
    if (targetCount === 1) {
      return [content];
    }
    
    // Find all potential break points in the content
    const breakPoints = this.findBreakPoints(content);
    
    if (breakPoints.length === 0) {
      return [content];
    }
    
    // If we need more splits than available break points, use what we have
    const splitsNeeded = targetCount - 1;
    const selectedBreaks = this.selectBestBreaks(breakPoints, splitsNeeded, targetSentences, content);
    
    // Split the content at selected break points
    return this.splitAtBreakPoints(content, selectedBreaks);
  }

  /**
   * Find all potential break points (punctuation) in content
   * @param {string} content - HTML content to analyze
   * @returns {Array} - Array of break point objects with position and score
   */
  findBreakPoints(content) {
    const breakPoints = [];
    const textContent = content.replace(/<[^>]*>/g, ' ');
    
    // Find all punctuation marks that could be break points
    const punctuationRegex = /[.;:,!?]/g;
    let match;
    
    while ((match = punctuationRegex.exec(textContent)) !== null) {
      const char = match[0];
      const position = match.index;
      
      // Score different punctuation marks
      let score = 0;
      switch (char) {
        case '.': score = 10; break;
        case '!': 
        case '?': score = 9; break;
        case ';': score = 8; break;
        case ':': score = 7; break;
        case ',': score = 5; break;
      }
      
      // Check if this is a good semantic break point
      const beforeText = textContent.substring(Math.max(0, position - 20), position).toLowerCase();
      const afterText = textContent.substring(position + 1, Math.min(textContent.length, position + 21)).toLowerCase();
      
      // Boost score for common prayer/text patterns
      if (this.isGoodBreakContext(beforeText, afterText, char)) {
        score += 3;
      }
      
      // Reduce score for abbreviations or poor contexts
      if (this.isPoorBreakContext(beforeText, afterText, char)) {
        score -= 3;
      }
      
      if (score > 0) {
        breakPoints.push({
          position: position + 1, // Break after the punctuation
          score: score,
          char: char,
          htmlPosition: this.textPositionToHtml(content, position + 1)
        });
      }
    }
    
    return breakPoints.sort((a, b) => a.position - b.position);
  }

  /**
   * Check if this is a good semantic break context
   * @param {string} before - Text before punctuation
   * @param {string} after - Text after punctuation  
   * @param {string} punctuation - The punctuation mark
   * @returns {boolean} - True if good break context
   */
  isGoodBreakContext(before, after, punctuation) {
    // Good contexts for breaking
    const goodAfterPatterns = [
      /^\s*[A-Z]/, // Capital letter after
      /^\s*(et|and|qui|quae|quod|sed|but|for)/i, // Common conjunctions
      /^\s*(amen|gloria|alleluia)/i, // Prayer endings/beginnings
    ];
    
    const goodBeforePatterns = [
      /(amen|terra|cælis|sancto)$/i, // Common prayer phrase endings
      /(nomen|regnum|voluntas|panem|debita)$/i, // Our Father phrases
    ];
    
    if (punctuation === '.') {
      return goodAfterPatterns.some(pattern => pattern.test(after));
    }
    
    if (punctuation === ':') {
      return goodAfterPatterns.some(pattern => pattern.test(after)) ||
             goodBeforePatterns.some(pattern => pattern.test(before));
    }
    
    if (punctuation === ',') {
      return goodAfterPatterns.some(pattern => pattern.test(after));
    }
    
    return false;
  }

  /**
   * Check if this is a poor break context (abbreviations, etc.)
   * @param {string} before - Text before punctuation
   * @param {string} after - Text after punctuation
   * @param {string} punctuation - The punctuation mark
   * @returns {boolean} - True if poor break context
   */
  isPoorBreakContext(before, after, punctuation) {
    // Poor contexts - don't break here
    const abbreviations = /(st|vs|etc|jr|sr|dr|mr|mrs|ms)$/i;
    const numbers = /\d$/;
    const singleLetters = /\b[a-z]$/i;
    
    if (punctuation === '.') {
      return abbreviations.test(before.trim()) || 
             numbers.test(before.trim()) || 
             singleLetters.test(before.trim());
    }
    
    return false;
  }

  /**
   * Convert text position to HTML position
   * @param {string} htmlContent - Original HTML content
   * @param {number} textPos - Position in text-only version
   * @returns {number} - Corresponding position in HTML
   */
  textPositionToHtml(htmlContent, textPos) {
    let htmlPos = 0;
    let currentTextPos = 0;
    let inTag = false;
    
    while (htmlPos < htmlContent.length && currentTextPos < textPos) {
      const char = htmlContent[htmlPos];
      
      if (char === '<') {
        inTag = true;
      } else if (char === '>') {
        inTag = false;
      } else if (!inTag) {
        currentTextPos++;
      }
      
      htmlPos++;
    }
    
    return htmlPos;
  }

  /**
   * Select the best break points based on target sentence count
   * @param {Array} breakPoints - Available break points
   * @param {number} splitsNeeded - Number of splits needed
   * @param {Array} targetSentences - Target sentences for length guidance
   * @param {string} content - Original content
   * @returns {Array} - Selected break point positions
   */
  selectBestBreaks(breakPoints, splitsNeeded, targetSentences, content) {
    if (breakPoints.length <= splitsNeeded) {
      return breakPoints.map(bp => bp.htmlPosition);
    }
    
    // Calculate ideal positions based on target sentence lengths
    const totalLength = content.replace(/<[^>]*>/g, '').length;
    const idealPositions = [];
    let currentPos = 0;
    
    for (let i = 0; i < splitsNeeded; i++) {
      const targetLength = targetSentences[i].replace(/<[^>]*>/g, '').length;
      const proportion = targetLength / targetSentences.reduce((sum, s) => sum + s.replace(/<[^>]*>/g, '').length, 0);
      currentPos += totalLength * proportion;
      idealPositions.push(currentPos);
    }
    
    // Select break points closest to ideal positions with highest scores
    const selectedBreaks = [];
    const usedBreaks = new Set();
    
    for (const idealPos of idealPositions) {
      let bestBreak = null;
      let bestScore = -1;
      
      for (const breakPoint of breakPoints) {
        if (usedBreaks.has(breakPoint.position)) continue;
        
        const distance = Math.abs(breakPoint.position - idealPos);
        const maxDistance = totalLength * 0.3; // Allow 30% deviation
        
        if (distance <= maxDistance) {
          const proximityScore = (maxDistance - distance) / maxDistance;
          const totalScore = breakPoint.score + proximityScore * 5;
          
          if (totalScore > bestScore) {
            bestScore = totalScore;
            bestBreak = breakPoint;
          }
        }
      }
      
      if (bestBreak) {
        selectedBreaks.push(bestBreak.htmlPosition);
        usedBreaks.add(bestBreak.position);
      }
    }
    
    return selectedBreaks.sort((a, b) => a - b);
  }

  /**
   * Split content at specified HTML positions
   * @param {string} content - HTML content to split
   * @param {Array} breakPositions - HTML positions to split at
   * @returns {Array} - Array of split content pieces
   */
  splitAtBreakPoints(content, breakPositions) {
    if (breakPositions.length === 0) {
      return [content];
    }
    
    const result = [];
    let lastPos = 0;
    
    for (const pos of breakPositions) {
      const piece = content.substring(lastPos, pos).trim();
      if (piece) {
        result.push(piece);
      }
      lastPos = pos;
    }
    
    // Add the last piece
    const lastPiece = content.substring(lastPos).trim();
    if (lastPiece) {
      result.push(lastPiece);
    }
    
    return result.filter(s => s.length > 0);
  }


  /**
   * Convert tables to divs with specified languages
   * @param {string} lang1 - First language
   * @param {string} lang2 - Second language
   * @returns {EnhancedDOM} - The current instance
   */
  divs(lang1, lang2) {
    const langMap = {};
    const languages = getDoOpt("LANGUAGES");
    
    languages.forEach(l => {
      langMap[l] = l.substring(0, 2).toLowerCase();
    });
    
    // Additional language mappings
    langMap["Polski"] = langMap["Polski-New"] = "pl";
    langMap["Magyar"] = "hu";
    langMap["Čeština/Bohemice"] = "cs";
    
    // Remove right-aligned divs
    this.css("div[align=right]").forEach(div => div.parentNode.removeChild(div));
    
    const tables = this.nodes("table");
    tables.forEach(table => {
      // Skip if this table is empty or contains only whitespace
      if (!table.textContent.trim()) return;
      
      const newDiv = this.createNode("div");
      newDiv.className = "table-container";
      
      const rows = Array.from(table.getElementsByTagName("tr"));
      rows.forEach(row => {
        const cells = Array.from(row.getElementsByTagName("td"));
        if (cells.length === 0) return;
        
        const newTable = this.createNode("div");
        newTable.className = "table";
        
        // Split content by <br> tags and clean up whitespace
        const content1 = cells[0].innerHTML.split(/<br>/i).map(line => line.trim()).filter(line => line);
        const content2 = cells.length > 1 ? 
          cells[1].innerHTML.split(/<br>/i).map(line => line.trim()).filter(line => line) : [];
        
        // Process all lines of content (handle both columns)
        const maxLines = Math.max(content1.length, content2.length);
        for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
          const line1 = lineIdx < content1.length ? content1[lineIdx] : "";
          const line2 = lineIdx < content2.length ? content2[lineIdx] : "";
          
          // Skip if both lines are empty
          if (!line1.trim() && !line2.trim()) continue;
          
          // Check if this line contains psalm content (verse numbers or typical psalm patterns)
          const isPsalmContent = this.isPsalmContent(line1) || this.isPsalmContent(line2);
          
          if (isPsalmContent) {
            // For psalms, create single row without sentence splitting
            const newRow = this.createNode("div");
            newRow.className = "table-row";
            
            // Create cell for first language
            const cell1 = this.createNode("div");
            cell1.className = lang1 === lang2 ? "table-cell lang0" : "table-cell lang1";
            cell1.setAttribute("lang", langMap[lang1] || lang1.substring(0, 2).toLowerCase());
            cell1.innerHTML = line1;
            newRow.appendChild(cell1);
     
            // Create cell for second language if different
            if (lang1 !== lang2) {
              const cell2 = this.createNode("div");
              cell2.className = "table-cell lang2";
              cell2.setAttribute("lang", langMap[lang2] || lang2.substring(0, 2).toLowerCase());
              cell2.innerHTML = line2;
              newRow.appendChild(cell2);
            }
            
            newTable.appendChild(newRow);
          } else {
            // Check if sentence splitting is disabled
            if (getOpt("nosplit")) {
              // No splitting - create single row like psalms
              const newRow = this.createNode("div");
              newRow.className = "table-row";
              
              // Create cell for first language
              const cell1 = this.createNode("div");
              cell1.className = lang1 === lang2 ? "table-cell lang0" : "table-cell lang1";
              cell1.setAttribute("lang", langMap[lang1] || lang1.substring(0, 2).toLowerCase());
              cell1.innerHTML = line1;
              newRow.appendChild(cell1);
       
              // Create cell for second language if different
              if (lang1 !== lang2) {
                const cell2 = this.createNode("div");
                cell2.className = "table-cell lang2";
                cell2.setAttribute("lang", langMap[lang2] || lang2.substring(0, 2).toLowerCase());
                cell2.innerHTML = line2;
                newRow.appendChild(cell2);
              }
              
              newTable.appendChild(newRow);
            } else {
              // For non-psalm content, use fuzzy logic to align sentence breaks
              let sentences1, sentences2;
              
              if (lang1 !== lang2) {
                // Split English first (usually more natural sentence breaks)
                const englishLine = langMap[lang2] === 'en' ? line2 : line1;
                const latinLine = langMap[lang2] === 'en' ? line1 : line2;
                
                if (langMap[lang2] === 'en') {
                  // English is second language, split it first
                  sentences2 = this.splitSentences(englishLine);
                  sentences1 = this.splitSentencesFuzzy(latinLine, sentences2);
                } else {
                  // English is first language, split it first  
                  sentences1 = this.splitSentences(englishLine);
                  sentences2 = this.splitSentencesFuzzy(latinLine, sentences1);
                }
              } else {
                // Same language on both sides, use regular splitting
                sentences1 = this.splitSentences(line1);
                sentences2 = this.splitSentences(line2);
              }
              
              // Process each sentence as a separate row
              const maxSentences = Math.max(sentences1.length, sentences2.length);
              for (let sentIdx = 0; sentIdx < maxSentences; sentIdx++) {
                const newRow = this.createNode("div");
                newRow.className = "table-row";
                
                // Always create cell for first language (even if empty)
                const cell1 = this.createNode("div");
                cell1.className = lang1 === lang2 ? "table-cell lang0" : "table-cell lang1";
                cell1.setAttribute("lang", langMap[lang1] || lang1.substring(0, 2).toLowerCase());
                cell1.innerHTML = sentIdx < sentences1.length ? sentences1[sentIdx] : "";
                newRow.appendChild(cell1);
         
                // Always create cell for second language if different (even if empty)
                if (lang1 !== lang2) {
                  const cell2 = this.createNode("div");
                  cell2.className = "table-cell lang2";
                  cell2.setAttribute("lang", langMap[lang2] || lang2.substring(0, 2).toLowerCase());
                  cell2.innerHTML = sentIdx < sentences2.length ? sentences2[sentIdx] : "";
                  newRow.appendChild(cell2);
                }
                
                newTable.appendChild(newRow);
              }
            }
          }
        }
        
        // Only append if newTable has children
        if (newTable.children.length > 0) {
          newDiv.appendChild(newTable);
        }
      });
      
      // Only append the new div if it has content
      if (newDiv.children.length > 0) {
        table.parentNode.insertBefore(newDiv, table);
      }
    });
    
    // Remove original tables
    this.css("table").forEach(table => table.parentNode.removeChild(table));
    return this;
  }

  /**
   * Add a stylesheet to the document
   * @returns {EnhancedDOM} - The current instance
   */
  addStyle() {
    const style = this.createNode("link");
    style.setAttribute("href", "../css/style.css");
    style.setAttribute("rel", "stylesheet");
    style.setAttribute("type", "text/css");
    this.head().appendChild(style);
    return this;
  }

  /**
   * Convert center-aligned elements to use CSS class instead
   * @returns {EnhancedDOM} - The current instance
   */
  centerStyle() {
    this.css("*[align=CENTER]").forEach(el => {
      el.removeAttribute("align");
      this.addClass(el, "center");
    });
    return this;
  }

  /**
   * Clean attributes from the body tag
   * @returns {EnhancedDOM} - The current instance
   */
  cleanBodyTag() {
    const body = this.body();
    [...body.attributes].forEach(attr => {
      body.removeAttribute(attr.name);
    });
    return this;
  }

  /**
   * Remove h1 elements
   * @returns {EnhancedDOM} - The current instance
   */
  removeH1() {
    this.css("h1").forEach(h1 => h1.parentNode.removeChild(h1));
    return this;
  }

  /**
   * Add IDs to hora headings
   * @returns {EnhancedDOM} - The current instance
   */
  addIdToHoras() {
    this.css("h2").forEach(h2 => {
      const text = h2.textContent;
      if (text && text.length > 3) {
        const id = text.substring(3)
          .replace(/am$/, "a")
          .replace(/as$/, "ae");
        h2.setAttribute("id", id);
      }
    });
    return this;
  }

  /**
   * Add XHTML namespace
   * @returns {EnhancedDOM} - The current instance
   */
  addHtmlns() {
    const html = this.css("html")[0];
    if (html) {
      html.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    }
    return this;
  }

  /**
   * Insert a date heading
   * @param {string} date - Date string to insert
   * @returns {EnhancedDOM} - The current instance
   */
  insertDate(date) {
    const dateHead = this.createNode("h1");
    dateHead.textContent = date;
    
    const firstP = this.css("p")[0];
    if (firstP) {
      firstP.parentNode.insertBefore(dateHead, firstP);
    }
    
    return this;
  }

  /**
   * Process verse numbers
   * @returns {EnhancedDOM} - The current instance
   */
  verseNumbers() {
    this.css(".text-sm.red").forEach(el => {
      if (/^\d/.test(el.textContent)) {
        this.addClass(el, "v-numbers");
      }
    });
    return this;
  }

  /**
   * Fix formatting of initial letters
   * @returns {EnhancedDOM} - The current instance
   */
  fixWrongInitials() {
    // First, find all text-xl.red elements that might need fixing
    const allXlElements = this.css(".text-xl.red");
    
    // Create a map of parent rows to their elements for faster lookup
    const rowMap = new Map();
    allXlElements.forEach(el => {
      const row = el.closest('.table-row');
      if (row) {
        if (!rowMap.has(row)) {
          rowMap.set(row, []);
        }
        rowMap.get(row).push(el);
      }
    });
    
    // Process each row that has potential elements
    rowMap.forEach((elements, row) => {
      // Check if any element in this row matches our patterns
      const hasMatch = elements.some(el => {
        const text = el.parentNode.textContent;
        return text.match(/Orémus/) || 
               text.match(/Sequéntia/) ||
               text.match(/Allelú[ij]a./) ||
               text.match(/Glória Patri, et Fílio, \* et Spirítui Sancto./) ||
               text.match(/Kýrie, eléison. Christe, eléison. Kýrie, eléison./);
      });
      
      // If we found a match, update all elements in this row
      if (hasMatch) {
        elements.forEach(el => {
          el.className = el.className.replace(/text-xl/, "text-lg");
        });
      }
    });
    
    return this;
  }

  /**
   * Omit comments if option is set
   * @returns {EnhancedDOM} - The current instance
   */
  omitComments() {
    if (getOpt("nocomments")) {
      this.css("span.black.text-sm").forEach(span => {
        if (/^{.*}$/.test(span.textContent)) {
          span.parentNode.removeChild(span);
        }
      });
    }
    return this;
  }

  /**
   * Omit sections marked as omitted if option is set
   * @returns {EnhancedDOM} - The current instance
   */
  omitOmitted() {
    if (getOpt("noomitted")) {
      this.css(".table-row").forEach(row => {
        if (/{omittitur}/.test(row.textContent)) {
          row.parentNode.removeChild(row);
        }
      });
    }
    return this;
  }

  /**
   * Collect expandable sections
   * @returns {EnhancedDOM} - The current instance
   */
  collectExpands() {
    this.css("input[type=RADIO]").forEach(input => {
      const onclick = input.getAttribute("onclick");
      if (onclick) {
        const expandSection = onclick.replace(/.*\"([$&].*?)\".*/, "$1");
        
        const link = this.createNode("a");
        link.setAttribute("href", "expands.html#" + expandSection.substring(1).replace(/ /g, "_"));
        link.innerHTML = "&nbsp;…";
        
        input.parentNode.appendChild(link);
        expands.push(expandSection);
      }
    });
    
    this.nodes("input").forEach(input => {
      input.parentNode.removeChild(input);
    });
    
    return this;
  }

  /**
   * Convert accented characters to ASCII equivalents
   * @param {string} text - Text to convert
   * @returns {string} - ASCII-converted text
   */
  toAscii(text) {
    if (!text) return text;
    
    // Common Latin character mappings
    const charMap = {
      // Vowels with macrons, breves, etc.
      'ā': 'a', 'ă': 'a', 'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'æ': 'ae', 'ǽ': 'ae',
      'ē': 'e', 'ĕ': 'e', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
      'ī': 'i', 'ĭ': 'i', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
      'ō': 'o', 'ŏ': 'o', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o', 'œ': 'oe',
      'ū': 'u', 'ŭ': 'u', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
      'ȳ': 'y', 'ỳ': 'y', 'ý': 'y', 'ŷ': 'y', 'ÿ': 'y',
      
      // Uppercase versions
      'Ā': 'A', 'Ă': 'A', 'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A', 'Æ': 'AE', 'Ǽ': 'AE',
      'Ē': 'E', 'Ĕ': 'E', 'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
      'Ī': 'I', 'Ĭ': 'I', 'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
      'Ō': 'O', 'Ŏ': 'O', 'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O', 'Œ': 'OE',
      'Ū': 'U', 'Ŭ': 'U', 'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
      'Ȳ': 'Y', 'Ỳ': 'Y', 'Ý': 'Y', 'Ŷ': 'Y', 'Ÿ': 'Y',
      
      // Common consonants
      'ç': 'c', 'Ç': 'C',
      'ñ': 'n', 'Ñ': 'N',
      'ß': 'ss',
      
      // Special liturgical characters
      'ǽ': 'ae', 'Ǽ': 'AE',
      
      // Common punctuation and symbols that might cause issues
      '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-',
      '\u2026': '...', '\u20AC': 'EUR', '\u00A3': 'GBP', '\u00A9': '(c)', '\u00AE': '(r)',
      
      // Mathematical and other symbols
      '×': 'x', '÷': '/', '±': '+/-', '≤': '<=', '≥': '>='
    };
    
    let result = text;
    for (const [accented, ascii] of Object.entries(charMap)) {
      result = result.replace(new RegExp(accented, 'g'), ascii);
    }
    
    return result;
  }

  /**
   * Convert all text content to ASCII if ascii option is enabled
   * @returns {EnhancedDOM} - The current instance
   */
  convertToAscii() {
    if (!getOpt("ascii")) return this;
    
    // Find all text nodes and convert them
    const walker = this.document.createTreeWalker(
      this.document.body || this.document,
      this.dom.window.NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }
    
    textNodes.forEach(textNode => {
      if (textNode.textContent) {
        textNode.textContent = this.toAscii(textNode.textContent);
      }
    });
    
    // Also convert attribute values that might contain text
    const allElements = this.css("*");
    allElements.forEach(element => {
      // Convert title attributes
      if (element.hasAttribute('title')) {
        element.setAttribute('title', this.toAscii(element.getAttribute('title')));
      }
      
      // Convert alt attributes
      if (element.hasAttribute('alt')) {
        element.setAttribute('alt', this.toAscii(element.getAttribute('alt')));
      }
    });
    
    return this;
  }

  /**
   * Get the HTML content
   * @returns {string} - The HTML content
   */
  html() {
    // Convert to ASCII if option is enabled, but do it last
    this.convertToAscii();
    return this.dom.serialize();
  }
}

/**
 * Get the collected expand sections
 * @returns {Array} - Array of unique expand sections
 */
function getExpands() {
  return [...new Set(expands)];
}

/**
 * Clear the expands array
 */
function clearExpands() {
  expands = [];
}

export { EnhancedDOM, getExpands, clearExpands };
