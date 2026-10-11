#!/bin/zsh
# Drives Safari through the two-window spike's geometry probes and reads
# back where its windows really are, over Apple Events (osascript).
#
# Permissions, each prompted once and charged to the app hosting this
# shell (the terminal or editor, not osascript), possibly behind Touch ID:
#   ping            needs Automation → Safari.
#   js, click, log… need Safari's Develop → Developer settings →
#                   "Allow JavaScript from Apple Events" as well.
#   press           needs Accessibility (System Events synthesises a real
#                   Return key — a user activation, which a scripted
#                   click() is not, so window.open obeys the pop-up rules).
# A hung command usually means an unanswered permission prompt: answer it
# and run the command again.
#
# Usage: spike/safari-driver.sh <command> [arg]
#   ping                 Automation permission probe; prints Safari's version.
#   open                 Opens SPIKE_URL in a new Safari window.
#   js                   Evaluates 1+1 in the spike tab (JS permission probe).
#   click <element-id>   Scripted click — carries no user activation.
#   press <element-id>   Focuses the element, then a real Return key.
#   run <javascript>     Evaluates in the spike tab, prints the result.
#   log                  Prints the spike's log pane.
#   geometry             Prints the spike's geometry status line.
#   windows              Lists every Safari window: index, title, bounds.
#   close-spike          Closes spike tabs and probe windows.
#   auto                 The whole measurement in one run — one permission
#                        moment covers it: opens the spike, clicks the
#                        probe without a gesture, then presses it with a
#                        real Return, and prints the log, the geometry
#                        line and every window's bounds.
#
# SPIKE_URL overrides the default http://127.0.0.1:8765/spike/two-window.html.

set -u
export SPIKE_URL=${SPIKE_URL:-http://127.0.0.1:8765/spike/two-window.html}

# Runs the JavaScript in $1 in the spike's tab, wherever it sits.
in_spike() {
  osascript - "$1" <<'EOS'
on run argv
  set js to item 1 of argv
  set base to system attribute "SPIKE_URL"
  tell application "Safari"
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t starts with base then return do JavaScript js in t
      end repeat
    end repeat
  end tell
  error "no spike tab (open one with: safari-driver.sh open)"
end run
EOS
}

case ${1:-help} in
ping)
  osascript -e 'tell application "Safari" to get version' ;;
open)
  osascript -e 'tell application "Safari"
    activate
    make new document with properties {URL: system attribute "SPIKE_URL"}
  end tell' ;;
js)
  in_spike '1+1' ;;
click)
  in_spike "document.getElementById('$2').click(); 'clicked $2'" ;;
press)
  osascript - "$2" <<'EOS'
on run argv
  set elt to item 1 of argv
  set base to system attribute "SPIKE_URL"
  tell application "Safari"
    activate
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t starts with base then
          set current tab of w to t
          set index of w to 1
          do JavaScript "document.getElementById('" & elt & "').focus()" in t
          delay 0.4
          tell application "System Events" to key code 36
          return "pressed Return on " & elt
        end if
      end repeat
    end repeat
  end tell
  error "no spike tab (open one with: safari-driver.sh open)"
end run
EOS
  ;;
run)
  in_spike "$2" ;;
log)
  in_spike "document.getElementById('log').textContent" ;;
geometry)
  in_spike "document.getElementById('geometry').textContent" ;;
windows)
  osascript -e 'tell application "Safari"
    set out to ""
    repeat with i from 1 to count of windows
      set w to window i
      set out to out & i & " | " & (name of w) & " | bounds " & (item 1 of (bounds of w)) & "," & (item 2 of (bounds of w)) & " .. " & (item 3 of (bounds of w)) & "," & (item 4 of (bounds of w)) & linefeed
    end repeat
    return out
  end tell' ;;
auto)
  print "— Safari $($0 ping) —"
  $0 open >/dev/null
  sleep 2
  if ! $0 js >/dev/null 2>&1; then
    print "do JavaScript is off: enable Safari → Settings → Developer →"
    print "\"Allow JavaScript from Apple Events\", then rerun."
    exit 1
  fi
  print "— scripted click on the probe (no user activation) —"
  $0 click probe-btn >/dev/null
  sleep 4
  print "— real Return press on the probe button —"
  $0 press probe-btn >/dev/null
  sleep 4
  print "— probe-fix: re-create, correct the blank, navigate —"
  $0 press probe-fix-btn >/dev/null
  sleep 4
  print "— probe-move: correct the loaded probe —"
  $0 press probe-move-btn >/dev/null
  sleep 2
  print "— spike geometry line —"
  $0 geometry
  print "— spike log (newest first) —"
  $0 log
  print "— Safari windows —"
  $0 windows ;;
close-spike)
  osascript - <<'EOS'
set base to system attribute "SPIKE_URL"
tell application "Safari"
  repeat with w in windows
    if name of w starts with "probe @" then
      close w
    else
      repeat with t in tabs of w
        if URL of t starts with base then close t
      end repeat
    end if
  end repeat
end tell
EOS
  ;;
*)
  sed -n '2,28p' "$0" ;;
esac
