# Publishing Guide

This guide covers building and publishing the Telescope VS Code extension to various marketplaces.

## Prerequisites

### Install Dependencies

```bash
# From repository root
pnpm install
```

### Install VS Code Extension Manager

```bash
pnpm add -g @vscode/vsce
```

Or with npm:
```bash
npm install -g @vscode/vsce
```

## Building the Extension

### Build Both Packages

The Aperture extension uses direct TypeScript execution via Bun:

```bash
# Build the VS Code client
pnpm --filter aperture-client build

# Build the language server
pnpm --filter aperture-server build
```

### Verify Build

```bash
test -f packages/aperture-client/out/extension.js && echo "Client build complete"
test -f packages/aperture-server/out/server.js && echo "Server build complete"
```

## Packaging

### Prepare package.json

Before packaging, ensure `packages/aperture-client/package.json` has:

- Correct `version` field
- `private: false` (or remove the `private` field)
- All required metadata:
  - `displayName`
  - `description`
  - `publisher`
  - `repository`
  - `license`

### Create VSIX Package

```bash
cd packages/aperture-client

# Package the extension
vsce package
```

This creates a `.vsix` file (e.g., `telescope-0.1.0.vsix`) in the `packages/aperture-client` directory.

### Test Locally

```bash
# Install the packaged extension
code --install-extension telescope-0.1.0.vsix

# Or open VS Code and use: Extensions > Install from VSIX...
```

## VS Code Marketplace

### Create Publisher Account

1. Go to [Azure DevOps](https://dev.azure.com)
2. Sign in with your Microsoft account (or create one)
3. Navigate to User Settings > Personal Access Tokens
4. Create a new token with **Marketplace (Manage)** scope
5. Save the token securely

### Create Publisher

1. Go to [VS Code Marketplace Management](https://marketplace.visualstudio.com/manage)
2. Sign in and create a new publisher
3. Note your publisher ID

### Update package.json

```json
{
  "publisher": "your-publisher-id",
  "version": "0.1.0",
  "displayName": "Telescope",
  "description": "OpenAPI linting with real-time diagnostics"
}
```

### Publish

```bash
cd packages/aperture-client

# Publish with token
vsce publish -p <your-personal-access-token>

# Or set environment variable
export VSCE_PAT=<your-personal-access-token>
vsce publish
```

### Verify Publication

1. Check [Marketplace Management](https://marketplace.visualstudio.com/manage)
2. Your extension should appear in your publisher dashboard
3. Allow a few minutes for search indexing

## Eclipse Marketplace

The Eclipse Marketplace accepts VS Code extensions with additional steps.

### Create Eclipse Account

Sign up at [Eclipse Foundation](https://accounts.eclipse.org/user/register)

### Prepare Listing

1. Go to [Eclipse Marketplace](https://marketplace.eclipse.org/content/add)
2. Fill in extension details:
   - Name and description
   - Screenshots
   - Documentation links
   - Categories

### Upload Extension

1. Use the Eclipse Marketplace web interface
2. Upload your `.vsix` file
3. The marketplace will validate and process the extension

### Alternative: Direct Installation

Eclipse-based editors (Theia, etc.) can often install VS Code extensions directly:

- Users can install from the VS Code Marketplace URL
- Some distributions may require repackaging

## Open VSX Registry

For open-source VS Code extension registries.

### Create Account

1. Go to [Open VSX](https://open-vsx.org/)
2. Sign in with GitHub

### Get Access Token

1. Go to Settings > Access Tokens
2. Create a new token

### Publish

```bash
# Install ovsx CLI
pnpm add -g ovsx

# Publish
cd packages/aperture-client
ovsx publish -p <your-open-vsx-token>
```

## Version Management

### Semantic Versioning

Follow [semver](https://semver.org/):

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes

### Update Version

```bash
cd packages/aperture-client

# Update version in package.json
npm version patch  # or minor, or major

# Or manually edit package.json
```

### Pre-release Versions

For preview releases:

```json
{
  "version": "0.1.0-beta.1"
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/publish.yml
name: Publish Extension

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build
        run: pnpm build
      
      - name: Publish to VS Code Marketplace
        run: |
          cd packages/aperture-client
          npx vsce publish -p ${{ secrets.VSCE_PAT }}
      
      - name: Publish to Open VSX
        run: |
          cd packages/aperture-client
          npx ovsx publish -p ${{ secrets.OVSX_PAT }}
```

### Required Secrets

Add these secrets to your GitHub repository:

- `VSCE_PAT`: VS Code Marketplace access token
- `OVSX_PAT`: Open VSX access token

## Troubleshooting

### Build Errors

**Issue**: TypeScript compilation fails

```bash
# Clean and rebuild
pnpm --filter aperture-client clean
pnpm --filter aperture-client build
```

**Issue**: Missing dependencies

```bash
# Reinstall from root
rm -rf node_modules packages/*/node_modules
pnpm install
```

### Packaging Errors

**Issue**: vsce reports missing fields

Ensure these fields exist in `package.json`:

```json
{
  "name": "telescope",
  "displayName": "Telescope",
  "description": "OpenAPI linting tool",
  "version": "0.1.0",
  "publisher": "your-publisher-id",
  "engines": {
    "vscode": "^1.80.0"
  },
  "main": "./out/extension.js"
}
```

**Issue**: Server path not found

The extension expects the server at `../aperture-server/src/server.ts`. Ensure:

1. Both packages are built
2. Bun is installed and in PATH
3. Relative path structure is preserved in package

### Publishing Errors

**Issue**: Token expired or invalid

1. Generate a new token from Azure DevOps
2. Ensure token has **Marketplace (Manage)** scope
3. Token must have **All accessible organizations** access

**Issue**: Version conflict

```bash
# Increment version before republishing
npm version patch
vsce publish
```

**Issue**: Extension too large

1. Check `.vscodeignore` excludes unnecessary files
2. Remove dev dependencies from bundle
3. Use `vsce ls` to see included files

### Runtime Issues

**Issue**: Extension doesn't activate

1. Check **Aperture Language Server** output channel
2. Verify Bun is installed: `bun --version`
3. Check file associations in VS Code settings

**Issue**: Server crashes

1. Enable debug logging: `TELESCOPE_LOG_LEVEL=debug`
2. Attach debugger to port 6009
3. Check for TypeScript errors in custom rules

## Related Documentation

- [VS Code Publishing Docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Open VSX Docs](https://github.com/eclipse/openvsx/wiki)
- [vsce CLI Reference](https://github.com/microsoft/vscode-vsce)

