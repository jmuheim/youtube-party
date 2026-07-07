#!/usr/bin/env bash
# PostToolUse hook: deterministic skill reminders based on edited path.
#
# Skills auto-load probabilistically from their descriptions; this hook
# makes the routing deterministic — every edit to a governed path gets
# a reminder injected, whether or not the skill was already loaded.
#
# Wiring (add to .claude/settings.json alongside check_html_safe.sh):
# {
#   "hooks": {
#     "PostToolUse": [
#       {
#         "matcher": "Edit|Write",
#         "hooks": [
#           { "type": "command",
#             "command": ".claude/hooks/skill_reminder.sh" }
#         ]
#       }
#     ]
#   }
# }
#
# Exit 0 with JSON output providing additionalContext (non-blocking
# reminder). This never fails the edit; it only informs.

input=$(cat)
file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

reminders=()

case "$file_path" in
  *app/views/*|*app/components/*|*app/helpers/*)
    reminders+=("This edit touches view/UI code: apply the 'accessibility' skill (semantic HTML, focus handling, keyboard flows; aria-live content must also be visible).")
    ;;
esac

case "$file_path" in
  *spec/*)
    reminders+=("This edit touches specs: apply the 'testing-conventions' skill (extend existing feature spec files, Cuprite driver, no sleeps, fake clocks for timing, axe-core assertions on happy paths).")
    ;;
esac

case "$file_path" in
  *player*|*playback*|*crossfade*|*transition*)
    reminders+=("This edit touches playback code: apply the 'playback-crossfade' skill (two-player architecture, cancellation tokens, beat-aware durations, Turbo broadcasts must not touch player DOM).")
    ;;
esac

case "$file_path" in
  *docs/decisions.md)
    reminders+=("This edit touches the decision log: apply the 'decision-log' skill (sequential numbering, Decision/Why structure, supersede via blockquote, never rewrite history).")
    ;;
esac

if [ ${#reminders[@]} -gt 0 ]; then
  joined=$(printf '%s ' "${reminders[@]}")
  # JSON-escape the double quotes in the reminder text
  escaped=$(echo "$joined" | sed 's/"/\\"/g')
  echo "{\"hookSpecificOutput\": {\"hookEventName\": \"PostToolUse\", \"additionalContext\": \"${escaped}\"}}"
fi

exit 0
