#!/usr/bin/env bash
# Runs a pgTAP test file against the local Supabase database and fails the
# process when any assertion reports "not ok" — plain psql exits 0 even when
# pgTAP tests fail, because a failed assertion is TAP output, not a SQL error.
set -euo pipefail

test_file="$1"

output=$(docker exec -i supabase_db_fineprint psql -U postgres -d postgres -Atq < "$test_file")
echo "$output"

if echo "$output" | grep -q '^not ok'; then
  echo "pgTAP: failing assertions in $test_file" >&2
  exit 1
fi
