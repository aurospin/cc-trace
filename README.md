# cc-trace

Record all Claude Code API traffic using an HTTPS MITM proxy. Works with modern Claude Code (compiled Bun binary).

## Install

```bash
npm install -g cc-trace
```

## Usage

```bash
# Start Claude Code with traffic logging
cc-trace attach

# Custom output directory
cc-trace attach --output-dir ~/traces

# Generate HTML from existing JSONL
cc-trace report session.jsonl

# Generate session index
cc-trace index
```

Logs are saved to `.cc-trace/` in the current directory.

## Development

```bash
npm install
npm run build
npm test
```
