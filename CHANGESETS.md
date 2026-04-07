# How to Use Changesets for Versioning

This project uses [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs across the monorepo.

## Workflow

### 1. Add a Changeset
Whenever you make a change that requires a version bump, run:
```bash
pnpm changeset
```
Follow the interactive prompts:
- Select the packages that have changed (`frontend`, `backend`, or both).
- Choose the bump type (patch, minor, or major) following [SemVer](https://semver.org/).
- Provide a brief description of the changes.

This will create a new markdown file in the `.changeset` directory. **Commit this file** with your changes.

### 2. Automatic Pull Request
Once your changes (including the changeset file) are merged into the `main` branch, the **Release Workflow** will:
1. Detect the new changesets.
2. Automatically create or update a Pull Request named **"Version Packages"**.
3. This PR will contain the updated `package.json` versions and the generated `CHANGELOG.md` entries.

### 3. Release
When you are ready to release:
1. Merge the **"Version Packages"** PR into `main`.
2. The workflow will then tag the commit with the new versions.
3. Your CI/CD pipeline will pick up the new tags and build/deploy the versioned Docker images.

## Manual Versioning (if needed)
To manually apply changesets and update versions locally:
```bash
pnpm version
```
This will consume the changesets and update the `package.json` files.
