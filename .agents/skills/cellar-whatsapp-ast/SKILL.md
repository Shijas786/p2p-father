---
name: cellar-whatsapp-ast
description: >-
  Uses the Cellar AST analysis and version-diffing engine for WhatsApp Web JS bundles.
  Trigger when investigating WhatsApp Web internal modules, reverse-engineering Meta web clients,
  auditing breaking changes between WhatsApp Web releases, or building resilient WhatsApp message handlers.
---

# Cellar — WhatsApp Web AST & Bundle Analysis Skill

This skill provides operational guidance for inspecting, searching, and diffing WhatsApp Web JavaScript bundles using `cellar`.

## Core CLI Commands

### 1. Bundle Management
- Fetch latest WhatsApp Web bundle:
  ```bash
  cellar bundle add --rev latest
  ```
- List stored bundle revisions:
  ```bash
  cellar bundle list
  ```

### 2. Module Search & Inspection
- Search module by name or export:
  ```bash
  cellar module search <term>
  ```
- Grep across all module sources using AST regex:
  ```bash
  cellar grep <regex_pattern>
  ```
- View module code and exported symbols:
  ```bash
  cellar module show <module_name>
  ```

### 3. Version Diffing & Graph Analysis
- Compare two WhatsApp Web versions:
  ```bash
  cellar diff <old_rev> <new_rev> --format markdown
  ```
- Generate dependency or dependent graph for a module:
  ```bash
  cellar graph <module_name> --format mermaid
  ```

### 4. MCP Server Integration
Cellar exposes an MCP server (`cellar mcp`) configured in `~/.gemini/config/mcp_config.json` allowing AI agents to query the WhatsApp Web AST index directly over stdio.
