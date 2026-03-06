#!/usr/bin/env node
/**
 * Parse NOAA Storm Prediction Center Day 2 Convective Outlook
 * Extracts key severe weather information from the SPC outlook page.
 * Optimized for AI agent parsing with structured location and threat data.
 */

import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';

class SPCOutlookParser {
  constructor() {
    this.inPre = false;
    this.inImpactsSpan = false;
    this.forecastText = '';
    this.currentRiskLevel = null;
    this.riskTableData = [];
    this.currentRow = {};
  }

  parse(html) {
    // Extract forecast text from <pre> tags
    const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
    if (preMatch) {
      this.forecastText = preMatch[1];
    }

    // Extract risk table data
    const tableRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let match;
    
    while ((match = tableRegex.exec(html)) !== null) {
      const row = match[1];
      
      // Extract risk level from class
      const riskMatch = row.match(/class="[^"]*ac-([^"\s]+)/);
      if (riskMatch) {
        const riskLevel = riskMatch[1].toUpperCase();
        const rowData = { risk_level: riskLevel };
        
        // Extract data from spans with class="impacts"
        const impactsRegex = /<span class="impacts">([^<]+)<\/span>/g;
        const values = [];
        let impactsMatch;
        
        while ((impactsMatch = impactsRegex.exec(row)) !== null) {
          const value = impactsMatch[1].trim();
          if (value && !value.includes('Day 2 Risk') && 
              !value.includes('Area (sq. mi.)') && 
              !value.includes('Area Pop.') &&
              !value.includes('Population Centers')) {
            values.push(value);
          }
        }
        
        if (values.length >= 3) {
          rowData.area_sq_mi = values[0];
          rowData.population = values[1];
          rowData.cities = values[2];
          this.riskTableData.push(rowData);
        }
      }
    }

    return this;
  }
}

async function fetchOutlook(url = 'https://www.spc.noaa.gov/products/outlook/day2otlk.html') {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.text();
}

function parseOutlook(htmlContent) {
  const parser = new SPCOutlookParser();
  parser.parse(htmlContent);
  
  const text = parser.forecastText.trim();
  
  const result = {
    valid_time: null,
    updated: null,
    risk_areas: [],
    threats: [],
    discussion_sections: {},
    raw_discussion: text
  };
  
  // Extract valid time
  const validMatch = text.match(/Valid (\d{6}Z - \d{6}Z)/);
  if (validMatch) {
    result.valid_time = validMatch[1];
  }
  
  // Extract updated time from HTML
  const updatedMatch = htmlContent.match(/Updated:\s*([^<(]+)/);
  if (updatedMatch) {
    result.updated = updatedMatch[1].trim();
  }
  
  // Parse risk table data
  for (const row of parser.riskTableData) {
    const citiesStr = row.cities || '';
    const cities = citiesStr.split('...').map(c => c.trim()).filter(c => c);
    
    result.risk_areas.push({
      risk_level: row.risk_level,
      area_sq_mi: row.area_sq_mi || '',
      population: row.population || '',
      major_cities: cities
    });
  }
  
  // Extract threat information
  const threatPatterns = {
    tornadoes: /tornado(?:es)?|EF[0-9]-?(?:EF)?[0-9]/gi,
    hail: /hail|(?:one|two|three) inch/gi,
    wind: /damaging (?:thunderstorm )?winds?|wind gusts?|(?:50|65) knots?/gi,
    flooding: /flood(?:ing)?/gi
  };
  
  for (const [threatType, pattern] of Object.entries(threatPatterns)) {
    const matches = [...text.matchAll(pattern)];
    const threatMentions = [];
    
    for (const match of matches) {
      const start = Math.max(0, match.index - 100);
      const end = Math.min(text.length, match.index + match[0].length + 100);
      const context = text.slice(start, end).replace(/\n/g, ' ');
      threatMentions.push(context.trim());
    }
    
    if (threatMentions.length > 0) {
      result.threats.push({
        type: threatType,
        mentions: threatMentions.length,
        contexts: threatMentions.slice(0, 3)
      });
    }
  }
  
  // Extract geographic sections
  const sectionPattern = /\.\.\.([^.]+?)\.\.\.([\s\S]*?)(?=\.\.\.|$)/g;
  let sectionMatch;
  
  while ((sectionMatch = sectionPattern.exec(text)) !== null) {
    const sectionName = sectionMatch[1].trim();
    const sectionText = sectionMatch[2].trim();
    const locations = extractLocations(sectionText);
    
    result.discussion_sections[sectionName] = {
      text: sectionText,
      locations
    };
  }
  
  return result;
}

function extractLocations(text) {
  const locations = [];
  
  // State abbreviations (two capital letters)
  const stateMatches = text.matchAll(/\b([A-Z]{2})\b/g);
  const states = new Set([...stateMatches].map(m => m[1]));
  
  // Common geographic terms
  const geoTerms = [
    'Great Plains', 'Midwest', 'Mississippi Valley', 'Ozarks',
    'Four Corners', 'Upper Great Lakes', 'Red River', 'Lake MI'
  ];
  
  for (const term of geoTerms) {
    if (text.includes(term)) {
      locations.push(term);
    }
  }
  
  locations.push(...Array.from(states));
  
  return locations;
}

function formatOutput(data, formatType = 'human') {
  if (formatType === 'json') {
    return JSON.stringify(data, null, 2);
  }
  
  const output = [];
  output.push('='.repeat(70));
  output.push('NOAA SPC Day 2 Convective Outlook - AI Optimized Parse');
  output.push('='.repeat(70));
  
  if (data.updated) {
    output.push(`\nUpdated: ${data.updated}`);
  }
  
  if (data.valid_time) {
    output.push(`Valid: ${data.valid_time}`);
  }
  
  if (data.risk_areas.length > 0) {
    output.push('\n--- RISK AREAS ---');
    for (const area of data.risk_areas) {
      output.push(`\n${area.risk_level}:`);
      output.push(`  Area: ${area.area_sq_mi} sq mi`);
      output.push(`  Population: ${area.population}`);
      output.push(`  Major Cities: ${area.major_cities.slice(0, 5).join(', ')}`);
    }
  }
  
  if (data.threats.length > 0) {
    output.push('\n--- THREAT TYPES ---');
    for (const threat of data.threats) {
      output.push(`\n${threat.type.toUpperCase()} (${threat.mentions} mentions)`);
      if (threat.contexts.length > 0) {
        output.push(`  Context: ...${threat.contexts[0].slice(0, 100)}...`);
      }
    }
  }
  
  if (Object.keys(data.discussion_sections).length > 0) {
    output.push('\n--- GEOGRAPHIC DISCUSSION SECTIONS ---');
    for (const [sectionName, sectionData] of Object.entries(data.discussion_sections)) {
      output.push(`\n${sectionName}:`);
      if (sectionData.locations.length > 0) {
        output.push(`  Locations: ${sectionData.locations.slice(0, 10).join(', ')}`);
      }
      output.push(`  Text: ${sectionData.text.slice(0, 200)}...`);
    }
  }
  
  output.push('\n' + '='.repeat(70));
  
  return output.join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      format: {
        type: 'string',
        default: 'human'
      },
      file: {
        type: 'string'
      },
      url: {
        type: 'string',
        default: 'https://www.spc.noaa.gov/products/outlook/day2otlk.html'
      }
    }
  });
  
  try {
    let html;
    
    if (values.file) {
      console.error(`Reading from file: ${values.file}`);
      html = await readFile(values.file, 'utf-8');
    } else {
      console.error(`Fetching from URL: ${values.url}`);
      html = await fetchOutlook(values.url);
    }
    
    console.error('Parsing outlook data...');
    const data = parseOutlook(html);
    
    console.log('\n' + formatOutput(data, values.format));
    
    return 0;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(process.exit);
}

export { fetchOutlook, parseOutlook, formatOutput };
