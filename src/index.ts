#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface JsonSchema {
  $schema?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean;
  enum?: JsonValue[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  pattern?: string;
  examples?: JsonValue[];
}

// ─── Type Detection ───

function detectFormat(value: string): string | undefined {
  // Date-time formats
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'date-time';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  if (/^\d{2}:\d{2}:\d{2}/.test(value)) return 'time';

  // Email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';

  // URI
  if (/^https?:\/\//.test(value)) return 'uri';

  // UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return 'uuid';

  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return 'ipv4';

  // IPv6
  if (/^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i.test(value)) return 'ipv6';

  return undefined;
}

function getType(value: JsonValue): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// ─── Schema Generation ───

function generateSchema(value: JsonValue, allRequired: boolean): JsonSchema {
  if (value === null) {
    return { type: 'null' };
  }

  if (Array.isArray(value)) {
    const schema: JsonSchema = { type: 'array' };

    if (value.length === 0) {
      schema.items = {};
    } else {
      // Merge schemas from all array items
      const itemSchemas = value.map(item => generateSchema(item, allRequired));
      schema.items = mergeSchemas(itemSchemas);
    }

    return schema;
  }

  if (typeof value === 'object') {
    const schema: JsonSchema = {
      type: 'object',
      properties: {},
    };

    const keys = Object.keys(value);
    for (const key of keys) {
      schema.properties![key] = generateSchema(value[key], allRequired);
    }

    if (allRequired && keys.length > 0) {
      schema.required = keys;
    }

    schema.additionalProperties = false;
    return schema;
  }

  if (typeof value === 'string') {
    const schema: JsonSchema = { type: 'string' };
    const format = detectFormat(value);
    if (format) schema.format = format;
    return schema;
  }

  if (typeof value === 'number') {
    return { type: Number.isInteger(value) ? 'integer' : 'number' };
  }

  if (typeof value === 'boolean') {
    return { type: 'boolean' };
  }

  return {};
}

// ─── Schema Merging ───

function mergeSchemas(schemas: JsonSchema[]): JsonSchema {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];

  // Collect all types
  const types = new Set<string>();
  const allProperties: Record<string, JsonSchema[]> = {};
  let hasItems = false;
  const itemSchemas: JsonSchema[] = [];
  const formats = new Set<string>();
  const allKeys = new Set<string>();
  const requiredKeys = new Set<string>();
  let firstPass = true;

  for (const schema of schemas) {
    // Types
    if (schema.type) {
      if (Array.isArray(schema.type)) {
        schema.type.forEach(t => types.add(t));
      } else {
        types.add(schema.type);
      }
    }

    // Properties
    if (schema.properties) {
      const keys = Object.keys(schema.properties);
      for (const key of keys) {
        allKeys.add(key);
        if (!allProperties[key]) allProperties[key] = [];
        allProperties[key].push(schema.properties[key]);
      }

      if (firstPass) {
        keys.forEach(k => requiredKeys.add(k));
        firstPass = false;
      } else {
        // Only keep keys that exist in ALL schemas
        for (const k of requiredKeys) {
          if (!keys.includes(k)) requiredKeys.delete(k);
        }
      }
    }

    // Items
    if (schema.items) {
      hasItems = true;
      itemSchemas.push(schema.items);
    }

    // Format
    if (schema.format) formats.add(schema.format);
  }

  const merged: JsonSchema = {};

  // Merge type
  if (types.size === 1) {
    merged.type = [...types][0];
  } else if (types.size > 1) {
    // integer + number = number
    if (types.has('integer') && types.has('number')) {
      types.delete('integer');
    }
    merged.type = types.size === 1 ? [...types][0] : [...types];
  }

  // Merge properties
  if (Object.keys(allProperties).length > 0) {
    merged.properties = {};
    for (const [key, propSchemas] of Object.entries(allProperties)) {
      merged.properties[key] = mergeSchemas(propSchemas);
      // If a property doesn't appear in all schemas, make it nullable
      if (propSchemas.length < schemas.length) {
        const propType = merged.properties[key].type;
        if (propType && typeof propType === 'string' && propType !== 'null') {
          merged.properties[key].type = [propType, 'null'];
        }
      }
    }

    if (requiredKeys.size > 0) {
      merged.required = [...requiredKeys];
    }

    merged.additionalProperties = false;
  }

  // Merge items
  if (hasItems && itemSchemas.length > 0) {
    merged.items = mergeSchemas(itemSchemas);
  }

  // Format (only if consistent)
  if (formats.size === 1) {
    merged.format = [...formats][0];
  }

  return merged;
}

// ─── CLI ───

function printHelp(): void {
  console.log(`
${c.bgBlue}${c.white}${c.bold} json-to-schema ${c.reset} ${c.dim}v1.0.0${c.reset}

${c.bold}Generate JSON Schema (draft-07) from sample JSON data${c.reset}

${c.yellow}USAGE${c.reset}
  ${c.cyan}json-to-schema${c.reset} [options] [file...]
  ${c.cyan}cat data.json | json-to-schema${c.reset}

${c.yellow}OPTIONS${c.reset}
  ${c.green}-f, --file${c.reset} <path>         Input JSON file (repeatable)
  ${c.green}--merge${c.reset}                    Merge schemas from multiple samples
  ${c.green}--required${c.reset}                 Mark all fields as required
  ${c.green}--title${c.reset} <title>            Schema title
  ${c.green}--description${c.reset} <desc>       Schema description
  ${c.green}--no-additional${c.reset}            Set additionalProperties: false (default)
  ${c.green}--additional${c.reset}               Allow additional properties
  ${c.green}--no-format${c.reset}                Skip format detection
  ${c.green}--compact${c.reset}                  Compact JSON output (no indentation)
  ${c.green}--help${c.reset}                     Show this help
  ${c.green}--version${c.reset}                  Show version

${c.yellow}EXAMPLES${c.reset}
  ${c.dim}# From file${c.reset}
  json-to-schema data.json

  ${c.dim}# From stdin${c.reset}
  echo '{"name":"John","age":30}' | json-to-schema

  ${c.dim}# Merge multiple samples${c.reset}
  json-to-schema --merge -f sample1.json -f sample2.json

  ${c.dim}# All fields required${c.reset}
  json-to-schema --required data.json

  ${c.dim}# With title${c.reset}
  json-to-schema --title "User" data.json

  ${c.dim}# Pipe-friendly${c.reset}
  curl https://api.example.com/users/1 | json-to-schema --title "User"
`);
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log('json-to-schema v1.0.0');
    process.exit(0);
  }

  let files: string[] = [];
  let mergeMode = false;
  let allRequired = false;
  let title = '';
  let description = '';
  let allowAdditional = false;
  let detectFormats = true;
  let compact = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-f':
      case '--file':
        files.push(args[++i]);
        break;
      case '--merge':
        mergeMode = true;
        break;
      case '--required':
        allRequired = true;
        break;
      case '--title':
        title = args[++i] || '';
        break;
      case '--description':
        description = args[++i] || '';
        break;
      case '--additional':
        allowAdditional = true;
        break;
      case '--no-additional':
        allowAdditional = false;
        break;
      case '--no-format':
        detectFormats = false;
        break;
      case '--compact':
        compact = true;
        break;
      default:
        if (!args[i].startsWith('-')) {
          files.push(args[i]);
        }
        break;
    }
  }

  // Collect JSON inputs
  const jsonInputs: string[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.resolve(file), 'utf8').trim();
      jsonInputs.push(content);
    } catch (err: any) {
      console.error(`${c.red}Error:${c.reset} Can't read file: ${file}`);
      console.error(err.message);
      process.exit(1);
    }
  }

  // Read from stdin if no files
  if (jsonInputs.length === 0) {
    const stdinData = await readStdin();
    if (stdinData) {
      jsonInputs.push(stdinData);
    }
  }

  if (jsonInputs.length === 0) {
    console.error(`${c.red}Error:${c.reset} No input provided. Use --help for usage.`);
    process.exit(1);
  }

  // Parse all inputs
  const parsedValues: JsonValue[] = [];
  for (const input of jsonInputs) {
    try {
      // Handle JSONL (one JSON per line)
      const lines = input.split('\n').filter(l => l.trim());
      if (lines.length > 1) {
        for (const line of lines) {
          parsedValues.push(JSON.parse(line));
        }
      } else {
        parsedValues.push(JSON.parse(input));
      }
    } catch (err: any) {
      console.error(`${c.red}Error:${c.reset} Invalid JSON input`);
      console.error(err.message);
      process.exit(1);
    }
  }

  // Generate schema(s)
  let schema: JsonSchema;

  if (mergeMode && parsedValues.length > 1) {
    const schemas = parsedValues.map(v => generateSchema(v, allRequired));
    schema = mergeSchemas(schemas);
  } else {
    schema = generateSchema(parsedValues[0], allRequired);
  }

  // Apply root schema properties
  schema.$schema = 'http://json-schema.org/draft-07/schema#';
  if (title) schema.title = title;
  if (description) schema.description = description;

  // Remove format detection if disabled
  if (!detectFormats) {
    removeFormats(schema);
  }

  // Handle additionalProperties
  if (allowAdditional) {
    removeAdditionalProperties(schema);
  }

  // Output
  const indent = compact ? 0 : 2;
  const output = JSON.stringify(schema, null, indent);

  if (process.stdout.isTTY && !compact) {
    // Colorized output for terminal
    console.log(colorizeJson(output));
  } else {
    console.log(output);
  }
}

function removeFormats(schema: JsonSchema): void {
  delete schema.format;
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      removeFormats(prop);
    }
  }
  if (schema.items) {
    removeFormats(schema.items);
  }
}

function removeAdditionalProperties(schema: JsonSchema): void {
  delete schema.additionalProperties;
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      removeAdditionalProperties(prop);
    }
  }
  if (schema.items) {
    removeAdditionalProperties(schema.items);
  }
}

function colorizeJson(json: string): string {
  return json
    .replace(/"([^"]+)":/g, `${c.cyan}"$1"${c.reset}:`)
    .replace(/: "([^"]+)"/g, `: ${c.green}"$1"${c.reset}`)
    .replace(/: (\d+)/g, `: ${c.yellow}$1${c.reset}`)
    .replace(/: (true|false)/g, `: ${c.magenta}$1${c.reset}`)
    .replace(/: (null)/g, `: ${c.dim}$1${c.reset}`);
}

main().catch((err) => {
  console.error(`${c.red}Error:${c.reset}`, err.message);
  process.exit(1);
});
