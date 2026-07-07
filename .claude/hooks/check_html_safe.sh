#!/usr/bin/env bash
# PostToolUse hook: block html_safe / raw() on user-influenced text.
#
# Enforces the rule from CLAUDE.md Conventions / decision #31:
# "Never mark user-provided text html_safe." Party message bodies and
# other user text render on a screen the whole party sees; Rails'
# default escaping must not be bypassed.
#
# Wiring (add to .claude/settings.json once the app is scaffolded):
# {
#   "hooks": {
#     "PostToolUse": [
#       {
#         "matcher": "Edit|Write",
#         "hooks": [
#           { "type": "command",
#             "command": ".claude/hooks/check_html_safe.sh" }
#         ]
#       }
#     ]
#   }
# }
#
# The hook receives the tool input as JSON on stdin. Exit 2 blocks and
# feeds stderr back to Claude; exit 0 allows.

input=$(cat)

# Extract the file path being written/edited.
file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

# Only guard app code (views, helpers, controllers, components, JS).
case "$file_path" in
  *app/*|*lib/*) ;;
  *) exit 0 ;;
esac

# Check the new content being written for the forbidden patterns.
if echo "$input" | grep -Eq 'html_safe|[^a-zA-Z_]raw\('; then
  echo "BLOCKED: this edit introduces html_safe or raw()." >&2
  echo "Per CLAUDE.md Conventions (decision #31), user-provided text" >&2
  echo "must never bypass Rails' default escaping — it renders on a" >&2
  echo "screen the whole party sees. Use plain interpolation, or if" >&2
  echo "trusted markup is genuinely needed, sanitize explicitly and" >&2
  echo "record the exception in docs/decisions.md first." >&2
  exit 2
fi

exit 0
