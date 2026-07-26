### 1. Branching Strategy

To keep the development workflow organized and ensure code quality, we follow a strict branching model enforced by GitHub branch protection rules (requiring pull requests and status checks with no bypasses):

- main: Represents production-ready code. Direct pushes to main are strictly prohibited. All changes must enter via Pull Requests.
- dev: The primary integration branch for ongoing development and testing.
- feature/\*: Branch naming convention for all new features, bug fixes, or experimental work (e.g., feature/webhook-retry). Branch off from dev and open your Pull Request back into dev.

---

### 2. Commit Conventions

To maintain a clean, readable, and automatically parseable git history, we follow conventional commit standards. This ensures every change clearly communicates its intent at a glance.

**Commit Message Format:** type(scope): short description

- `feat:` A new feature for the user or project.
- `fix:` A bug fix.
- `docs:` Documentation-only changes.
- `chore:` Maintenance tasks, dependency updates, or build script changes.

**Imperative Mood Rule:** Always write your short description in the imperative mood (e.g., add, fix, initialize — not added, adds, or adding).

**Note from experience:** Use Valid Conventional Commit Types: Do not invent custom types or use a definition as a type name (for example, using `setup` instead of `chore`). Stick strictly to recognized types.

**Be Specific in Your Summary** A structurally correct message (like `docs: documentation-only changes`) fails if the summary just restates what the type already means. Always describe what was actually documented or changed, rather than repeating the type definition.

---

### 3. Pre-Commit Hooks

To catch issues early and maintain code quality before code ever reaches remote CI, we use automated pre-commit hooks powered by Husky and `lint-staged`.

Every time you run `git commit`, the following checks execute automatically:

- `lint-staged:` Automatically runs linters against your staged TypeScript `(.ts)` files to ensure formatting and style compliance right in your workspace.
- `STRAY_JS` **Guard**: Our custom guard runs to prevent accidental stray JavaScript files from slipping into version control, enforcing our strict TypeScript-first architecture.

**Why this exists:** It provides fast, local feedback. Catching a type-safety violation or an unwanted file format in seconds on your own machine is infinitely faster than waiting to discover it after pushing to a remote pipeline.

---

### 4. Bypassing Hooks `(--no-verify)`

If you are wondering when it is acceptable to use the `--no-verify `flag to skip the pre-commit hooks, the short answer is: **almost never.**

- **When it is conditionally acceptable:** The only truly valid reason to bypass hooks is if you are saving an intermediate, broken Work-In-Progress (WIP) commit to a strictly local branch that will not be pushed, or if your local Node/Husky environment is actively broken and you are debugging the tooling itself.

- **When it is absolutely prohibited:** You should never bypass hooks because you are in a rush, because a strict TypeScript rule is frustrating to satisfy, or because you intend to "just let CI handle it."

Remember that these local hooks mirror our CI standards. Bypassing the hook locally does not make the error disappear; it just guarantees your Pull Request will fail the remote pipeline later. Fix the code locally where feedback is instantaneous.

---

### 5. Local Verification Commands

While pre-commit hooks catch issues automatically on commit, you should run these commands manually during development—especially before opening a Pull Request—to ensure your code is fully sound:

- **Build**: `npm run build` (compiles TypeScript to JavaScript)
- **Type-Check:** `npm run typecheck` (validates types without emitting files)
- **Watch Mode:** `npm run watch` (compiles automatically on file changes)
- **Run Tests:** `npm run test` (executes the test suite)
- **Run Linter:** `npm run lint` (checks code against style and safety rules)
- **Synthesize CloudFormation:** `npx cdk synth` (generates the CloudFormation template)
- **Compare Stack State** `npx cdk diff` (compares deployed stack with local state)
- **Deploy Stack:** `npx cdk deploy` (deploys infrastructure changes to AWS)

---

### 6. CI as the Authoritative Gate

While local hooks and commands provide fast, instantaneous feedback, they are ultimately bypassable on your machine. The remote CI pipeline serves as the final, non-bypassable source of truth; because GitHub branch protection rules require these exact checks to pass successfully in the remote environment before any code can be merged into main, the pipeline ensures that no unverified or broken code ever reaches production.
