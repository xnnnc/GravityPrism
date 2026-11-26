# Security Policy

## Local-Only Credential & Privacy Architecture

**Obsidian Prism** is designed with strict local-first security boundaries:

1. **Zero Secret Persistence in Repository**: API keys and custom system prompts configured for the optional OpenAI-compatible Thought Translator are stored exclusively on the user's machine at `~/.gemini/config/obsidian-prism-thought.json` with `0600` file permissions. They are masked in UI responses (`sk-••••xxxx`), redacted in error logs, and never written to project directories or `config.json`.
2. **Zero Arbitrary HTML Injection (XSS Defense)**: Translated Markdown and reasoning blocks are rendered strictly via DOM `createElement` / `createTextNode` (`textContent`), never via untrusted `innerHTML`.
3. **Loopback & Origin Isolation**: The local visual workbench (`workbench/server.cjs`) binds to `127.0.0.1` by default, enforces loopback `Host` / `Origin` checks against cross-site request forgery (CSRF), and enforces strict payload size limits.
4. **Safe Subprocess Execution**: All Git synchronization and process management operations use parameterized `execFile` arrays or UTF-16LE Base64 `-EncodedCommand` without shell string interpolation.

## Reporting a Vulnerability

Please report security issues privately via **GitHub Security Advisories** on the repository rather than opening a public issue. Include reproduction steps and affected OS / Node.js versions.
