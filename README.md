# json-to-schema

[![npm version](https://img.shields.io/npm/v/@lxgicstudios/json-to-schema.svg)](https://www.npmjs.com/package/@lxgicstudios/json-to-schema)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Generate JSON Schema (draft-07) from sample JSON data. It handles nested objects, arrays, type detection, and can merge multiple samples into one schema.

## Install

```bash
npm install -g @lxgicstudios/json-to-schema
```

Or run directly:

```bash
npx @lxgicstudios/json-to-schema data.json
```

## Features

- **Draft-07 output** - Generates valid JSON Schema draft-07
- **Type inference** - Detects string, number, integer, boolean, null, object, array
- **Format detection** - Recognizes date-time, email, URI, UUID, IPv4, IPv6
- **Schema merging** - Combine multiple samples into one schema
- **Required fields** - Mark all fields as required with one flag
- **Nested support** - Handles deeply nested objects and arrays
- **JSONL support** - Process multiple JSON objects per file
- **Pipe-friendly** - Works great with stdin/stdout
- **Colorized output** - Pretty terminal output with syntax highlighting
- **Zero dependencies** - Built with Node.js builtins only

## Usage

```bash
# From a file
json-to-schema data.json

# From stdin
echo '{"name":"John","age":30,"email":"john@example.com"}' | json-to-schema

# Merge multiple samples
json-to-schema --merge -f sample1.json -f sample2.json

# All fields required
json-to-schema --required data.json

# With title and description
json-to-schema --title "User" --description "A user object" data.json

# Pipe from an API
curl -s https://api.example.com/users/1 | json-to-schema --title "User"

# Compact output
json-to-schema --compact data.json
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file <path>` | Input JSON file (repeatable) | - |
| `--merge` | Merge schemas from multiple samples | `false` |
| `--required` | Mark all fields as required | `false` |
| `--title <title>` | Schema title | - |
| `--description <desc>` | Schema description | - |
| `--additional` | Allow additional properties | `false` |
| `--no-format` | Skip format detection | `false` |
| `--compact` | No indentation in output | `false` |
| `--help` | Show help | - |

## Example Output

Input:
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "active": true,
  "tags": ["admin", "user"]
}
```

Output:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id": { "type": "integer" },
    "name": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "active": { "type": "boolean" },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "additionalProperties": false
}
```

---

**Built by [LXGIC Studios](https://lxgicstudios.com)**

[GitHub](https://github.com/lxgicstudios/json-to-schema) | [Twitter](https://x.com/lxgicstudios)
