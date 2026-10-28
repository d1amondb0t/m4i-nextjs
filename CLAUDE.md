@AGENTS.md

# Code style rules

## Comments
- Do not add comments to functions by default. A function's name should be enough to tell what it does.
- Comment a function only when it is genuinely complex. Before adding the comment, try breaking it into smaller, well-named helper functions and calling those instead. Keep the comment only if the complexity remains after that.

## File organization
- Keep types, helper functions and the main functionality in separate files (for example `types.ts`, `*-helper.ts`, and the main module), rather than mixing them in one file.

## Error handling
- Do not add `try`/`catch` unless the function actually needs it, for example to recover, add context, or translate an error at a real boundary. Let errors propagate otherwise.

## Edge-case checks
- Add an edge-case check only when it makes sense for that function's responsibility.
- Before adding a check, look at the callers. If an earlier function in the call path already validates the input, do not repeat the check.
