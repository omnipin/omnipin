# Omnipin Plugin API - CLI Integration

## TL;DR

> **Quick Summary**: Add `--plugins=npm-pkg,./file.js` flag to CLI for dynamic ESM plugin loading, integrated with existing plugin interface (before/after hooks).

> **Deliverables**:
> - `--plugins` CLI flag for deploy, ens, pin commands
> - Plugin registry singleton for shared hook management
> - Hook integration in action handlers (deploy, ens, pin)

> **Estimated Effort**: Short
> **Parallel Execution**: YES - 3 tasks in parallel after scaffolding
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
Design a plugin API similar to esbuild plugin API, via `--plugins=npm-pkg,./file.js` dynamic ESM import. Plugins should be reusing the same plugin interface.

### Interview Summary
**Key Discussions**:
- CLI flag: `--plugins` accepting comma-separated plugin specifiers
- Supported actions: deploy, ens, pin
- Reuse existing plugin interface from `src/plugin.ts`

**Research Findings**:
- esbuild uses `name` + `setup(build)` pattern with `onResolve`/`onLoad` hooks
- Omnipin already has `OmnipinPlugin` interface with `name` + `setup(api)` and `PluginAPI` with `before(action)` + `after(action)` hooks
- Existing `plugin-loader.ts` already handles npm packages and local file imports via dynamic `import()`

### Metis Review
**Identified Gaps** (addressed):
- Plugin loading errors should be handled gracefully with clear messages
- Duplicate plugin names should be warned/handled
- Need to integrate registry with action handlers

---

## Work Objectives

### Core Objective
Add `--plugins` flag to CLI that dynamically loads ESM plugins and executes their before/after hooks for deploy, ens, and pin actions.

### Concrete Deliverables
1. `--plugins` option added to deploy, ens, pin commands in CLI
2. Plugin registry singleton exported for global access
3. Action handlers (deploy, ens, pin) execute plugin hooks

### Definition of Done
- [ ] `omnipin deploy ./dist --plugins=my-plugin` loads and runs my-plugin
- [ ] `omnipin pin QmX... --plugins=pkg1,./local.js` loads multiple plugins
- [ ] `before` hooks can modify action arguments
- [ ] `after` hooks receive action results

### Must Have
- Dynamic ESM import for both npm packages and local files
- Plugin validation (name + setup required)
- Hook execution before/after actions

### Must NOT Have (Guardrails)
- No breaking changes to existing plugin interface
- No plugin options/arguments (defer to v2)
- No changes to dnslink action (out of scope per user)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: YES - Tests after implementation
- **Framework**: bun test

### QA Policy
Every task includes agent-executed QA scenarios. Run commands, verify output.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation):
├── Task 1: Add --plugins CLI option to commands
├── Task 2: Create plugin registry singleton
└── Task 3: Integrate hooks in action handlers
```

### Dependency Matrix
- **1, 2**: No dependencies - can run immediately
- **3**: Depends on 1, 2

---

## TODOs

- [ ] 1. Add `--plugins` CLI option to deploy, ens, pin commands

  **What to do**:
  - Add `--plugins` option to deploy command in `src/cli.ts`
  - Add `--plugins` option to ens command in `src/cli.ts`
  - Add `--plugins` option to pin command in `src/cli.ts`
  - Option type: `string` (comma-separated plugin specifiers)

  **Must NOT do**:
  - Don't modify other commands (dnslink, status, ping, pack, zodiac)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple CLI option additions, well-understood pattern
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed for simple CLI flag addition

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/cli.ts:56-111` - deploy command structure with options
  - `src/cli.ts:234-254` - pin command structure with options
  - `src/cli.ts:134-146` - ens command structure with options

  **Acceptance Criteria**:
  - [ ] CLI accepts `--plugins` flag on deploy, ens, pin commands
  - [ ] Flag accepts comma-separated values (e.g., `pkg1,./file.js`)

  **QA Scenarios**:

  ```
  Scenario: CLI accepts --plugins flag on deploy
    Tool: Bash
    Preconditions: Build completed
    Steps:
      1. Run: omnipin deploy --help
      2. Assert: Output contains "--plugins"
    Expected Result: Help shows --plugins option
    Evidence: .sisyphus/evidence/task-1-deploy-help.txt

  Scenario: CLI accepts --plugins flag on pin
    Tool: Bash
    Preconditions: Build completed
    Steps:
      1. Run: omnipin pin --help
      2. Assert: Output contains "--plugins"
    Expected Result: Help shows --plugins option
    Evidence: .sisyphus/evidence/task-1-pin-help.txt

  Scenario: CLI accepts --plugins flag on ens
    Tool: Bash
    Preconditions: Build completed
    Steps:
      1. Run: omnipin ens --help
      2. Assert: Output contains "--plugins"
    Expected Result: Help shows --plugins option
    Evidence: .sisyphus/evidence/task-1-ens-help.txt
  ```

  **Commit**: NO (group with Task 3)

---

- [ ] 2. Create plugin registry singleton export

  **What to do**:
  - Export singleton instance from `src/plugin-registry.ts`
  - Add convenience function `getPluginRegistry()` in `src/plugin-registry.ts`
  - Export `loadPlugin` and `loadPlugins` from `src/plugin-loader.ts`

  **Must NOT do**:
  - Don't change PluginRegistry class behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple export additions, existing code modification
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `src/plugin-registry.ts:9-58` - PluginRegistry class
  - `src/plugin-loader.ts:5-25` - loadPlugin function

  **Acceptance Criteria**:
  - [ ] `import { pluginRegistry } from './plugin-registry.js'` works
  - [ ] `import { loadPlugins } from './plugin-loader.js'` works

  **QA Scenarios**:

  ```
  Scenario: Plugin registry singleton is exported
    Tool: Bash
    Preconditions: Build completed
    Steps:
      1. Run: node -e "import('./dist/plugin-registry.js').then(m => console.log('OK: registry' in m))"
      2. Assert: Output contains "true"
    Expected Result: Singleton exported
    Evidence: .sisyphus/evidence/task-2-registry-export.txt

  Scenario: loadPlugins helper is exported
    Tool: Bash
    Preconditions: Build completed
    Steps:
      1. Run: node -e "import('./dist/plugin-loader.js').then(m => console.log('OK: loadPlugins' in m))"
      2. Assert: Output contains "true"
    Expected Result: loadPlugins exported
    Evidence: .sisyphus/evidence/task-2-loadplugins-export.txt
  ```

  **Commit**: NO (group with Task 3)

---

- [ ] 3. Integrate hooks in action handlers

  **What to do**:
  - Modify `src/actions/deploy.ts` to call plugin hooks
  - Modify `src/actions/ens.ts` to call plugin hooks
  - Modify `src/actions/pin.ts` to call plugin hooks
  - Load plugins from `--plugins` option and execute before/after hooks

  **Must NOT do**:
  - Don't break existing action functionality if no plugins specified
  - Don't modify dnslink action

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration work requiring careful modification of action handlers
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after 1, 2)
  - **Blocks**: None
  - **Blocked By**: Task 1, Task 2

  **References**:
  - `src/plugin-registry.ts:37-57` - runBefore/runAfter methods
  - `src/actions/deploy.ts:25-231` - deployAction function
  - `src/actions/pin.ts:17-95` - pinAction function
  - `src/plugin.ts:47-55` - PluginAPI interface

  **Acceptance Criteria**:
  - [ ] deploy action runs before/after hooks when --plugins specified
  - [ ] pin action runs before/after hooks when --plugins specified
  - [ ] ens action runs before/after hooks when --plugins specified

  **QA Scenarios**:

  ```
  Scenario: Plugin hooks execute on deploy with --plugins
    Tool: Bash
    Preconditions: Build completed, test plugin created
    Steps:
      1. Create test plugin at /tmp/test-plugin.js with name + setup exporting before/after
      2. Run: omnipin deploy ./dist --plugins=file:///tmp/test-plugin.js 2>&1
      3. Assert: Output contains plugin name (indicating it loaded)
    Expected Result: Plugin loads and runs hooks
    Evidence: .sisyphus/evidence/task-3-deploy-plugins.txt

  Scenario: Multiple plugins load from comma-separated list
    Tool: Bash
    Preconditions: Build completed
    Steps:
      1. Run: omnipin pin QmX --plugins=non-existent-pkg 2>&1
      2. Assert: Error message about failing to load plugin
    Expected Result: Clear error message
    Evidence: .sisyphus/evidence/task-3-plugin-error.txt
  ```

  **Commit**: YES
  - Message: `feat(cli): add --plugins flag for dynamic ESM plugin loading`
  - Files: `src/cli.ts`, `src/plugin-registry.ts`, `src/plugin-loader.ts`, `src/actions/deploy.ts`, `src/actions/ens.ts`, `src/actions/pin.ts`
  - Pre-commit: `bun test`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — Read plan, verify all tasks implemented
  Output: Tasks [3/3] | VERDICT

- [ ] F2. **Code Quality Review** — Run tsc, lint, tests
  Output: Build [PASS/FAIL] | Tests [N pass/N fail] | VERDICT

- [ ] F3. **Real Manual QA** — Test --plugins flag end-to-end
  Output: Scenarios [N/N pass] | VERDICT

- [ ] F4. **Scope Fidelity Check** — Verify only deploy, ens, pin modified
  Output: Files [expected vs actual] | VERDICT

---

## Commit Strategy

- **1**: `feat(cli): add --plugins flag for dynamic ESM plugin loading`

---

## Success Criteria

### Verification Commands
```bash
omnipin deploy --help | grep --plugins  # Shows --plugins option
omnipin pin --help | grep --plugins     # Shows --plugins option
omnipin ens --help | grep --plugins     # Shows --plugins option
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Tests pass
