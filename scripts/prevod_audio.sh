#!/bin/bash
# Dvouprůchodová normalizace hlasitosti a převod do mono 96 kb/s.
set -u
ZDROJ="$HOME/mnt/tat-prochazka"
CIL="$HOME/mnt/dev/audiochuze/audio"
mkdir -p "$CIL"

prevod() {
  vstup="$ZDROJ/$1"; vystup="$CIL/$2"
  [ -f "$vstup" ] || { echo "CHYBI: $vstup"; return 1; }
  json=$(ffmpeg -hide_banner -nostats -i "$vstup" \
    -af loudnorm=I=-16:TP=-3.0:LRA=11:print_format=json -f null - 2>&1 \
    | sed -n '/^{/,/^}/p')
  mi=$(echo "$json" | sed -n 's/.*"input_i" *: *"\([^"]*\)".*/\1/p')
  mtp=$(echo "$json" | sed -n 's/.*"input_tp" *: *"\([^"]*\)".*/\1/p')
  mlra=$(echo "$json" | sed -n 's/.*"input_lra" *: *"\([^"]*\)".*/\1/p')
  mth=$(echo "$json" | sed -n 's/.*"input_thresh" *: *"\([^"]*\)".*/\1/p')
  off=$(echo "$json" | sed -n 's/.*"target_offset" *: *"\([^"]*\)".*/\1/p')
  ffmpeg -y -hide_banner -loglevel error -i "$vstup" \
    -af "loudnorm=I=-16:TP=-3.0:LRA=11:measured_I=$mi:measured_TP=$mtp:measured_LRA=$mlra:measured_thresh=$mth:offset=$off:linear=true" \
    -ac 1 -ar 44100 -codec:a libmp3lame -b:a 96k -map_metadata -1 "$vystup"
  printf "%-18s -> %-14s  vstup %s LUFS  %s\n" "$1" "$2" "$mi" "$(du -h "$vystup" | cut -f1)"
}

for par in "$@"; do
  prevod "${par%%:*}" "${par##*:}"
done
