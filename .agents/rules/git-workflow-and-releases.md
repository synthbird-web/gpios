# Git Workflow and Release Guidelines

1. **Active Development Branch**:
   - Always develop and test new features and fixes on the `develop` branch first.
   - Run and validate all automated tests thoroughly before merging (including `npm run test:server`).

2. **Production Integration (`main`)**:
   - Once tasks on `develop` are verified and complete, merge the changes into `main`:
     ```bash
     git checkout main
     git merge develop
     git push origin main
     git checkout develop
     ```

3. **Commit Messages & Language Standards**:
   - **All commit messages must strictly be written in English** using Conventional Commits format (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Commits in any other language are strictly forbidden.
   - Commit messages should be concise, professional, and imperative (e.g. `feat: add boundary zoom fitting`, `fix: handle offline tile errors`).

4. **Privacy & Identity Hygiene**:
   - Never commit personal email addresses or confidential identifiers to public repositories.
   - Use the official project git author identity:
     ```bash
     git config user.name "Vision by Data"
     git config user.email "synthbird-web@users.noreply.github.com"
     ```
   - Ensure local databases or scratch logs containing private outings or coordinates are excluded via `.gitignore`.

5. **Cross-Platform Distribution & GitHub Releases**:
   - Standalone binaries are compiled and published automatically via the GitHub Actions CI/CD workflow (`.github/workflows/release.yml`) whenever a version tag is pushed:
     ```bash
     git tag -a v1.0.0 -m "GPIOS v1.0.0 — Global Release"
     git push origin v1.0.0
     ```
   - Standard release artifact filenames:
     - Windows: `GPIOS-1.0.0-win.zip`
     - macOS (Apple Silicon): `GPIOS-1.0.0-arm64-mac.zip`
     - Linux: `GPIOS-1.0.0.AppImage`
