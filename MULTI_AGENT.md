# Working with multiple agents

Use one branch and one Git worktree per concurrent task. Agents working in the same checkout share files, index, HEAD, dependencies, build output and servers; selecting different files does not isolate them. Worktrees separate those surfaces while sharing Git objects and refs.

## Start a task

Assign one owner, a concrete scope and a base branch. Create the branch/worktree before editing, and launch the agent in that directory. Use the agreed base; normally this is current `origin/main`:

```powershell
git fetch origin
git worktree add -b fix/example .worktrees/example origin/main
git -C .worktrees/example status -sb
```

Verify the absolute working directory and branch before every commit. If the launcher cannot start an agent in its assigned worktree, do not run parallel edits in the shared checkout. Use sequential work instead. This guide does not authorize automatic delegation; spawn agents only when requested by the user or applicable instructions.

## Ownership and shared files

- Each agent owns its worktree, branch, index, processes and test artifacts. Do not switch branches, stash, reset, clean, stop processes, or commit from another agent's checkout.
- Agree who changes shared contracts and documentation such as `AGENTS.md`, `PLAN.md`, `README.md` and lockfiles. Independent worktrees prevent overwrites but cannot prevent merge conflicts; reconcile them during integration. Avoid parallel edits to the same API/schema when tasks depend on each other.
- Start independent tasks from the agreed base, not another agent's uncommitted files. For dependent work, wait for a reviewed commit and explicitly use that branch/commit as the base. Report the dependency.
- Stage explicit paths and review `git diff --cached`. Never use `git add -A` in a shared/dirty checkout. Commit and push only the assigned branch. Do not merge or push to `main` without authorization.

## Runtime isolation

- Install dependencies separately in each worktree when needed; do not share `node_modules` or `.next` through symlinks. Gitignored dependencies and local environment files are not copied into a new worktree.
- Assign unique application and UI-test ports. Set `PLAYWRIGHT_PORT` for ordinary UI tests; their default is 3210. Persistence tests currently use fixed port 3220, so serialize those runs unless their configuration is explicitly given a dedicated port.
- Keep development databases, temporary test databases, reports and screenshots isolated. Never point an agent's tests at another task's database or the user's saved board. Do not copy secrets into commits or broadly duplicate environment files.
- Run UI tests, builds and production persistence sequentially within a worktree because their Next.js outputs are related. Different worktrees isolate build files, but still share machine resources and ports; avoid concurrent heavy suites.
- Follow `TESTING.md` to select checks for the task. Multiple agents do not justify repeating the full test matrix in each checkout.

## Review and integrate

Each handoff names the branch, worktree, base commit, commits to integrate, changed behavior, checks performed and known limits. An integration owner reviews the combined diff, resolves shared-file conflicts in an integration worktree, and runs the checks appropriate to the combined change. Merge or cherry-pick only after authorization; preserve each task's scope.

After integration, stop only the task's own processes. Remove a worktree only after confirming it is clean and its commits are retained on the intended branch/remote. Never force-remove a worktree with unfinished changes.

## If work lands on another agent's branch

Stop branch/index mutations and inspect local and remote history. Back up dirty changes, including untracked files, before repair. Do not stash the other agent's work or force-push its branch.

For an already published misplaced commit, use a revert on that branch and reapply the changes on an independent branch from the original clean base. The independent commit matters: simply branching at the misplaced commit can let the later revert undo the feature during integration. Verify the other agent's remaining edits and the merge base before pushing the repair.

If another agent advances the branch or edits affected files during preparation, stop and rebuild the repair from the new state. Use normal fast-forward pushes so unexpected remote changes fail safely.
