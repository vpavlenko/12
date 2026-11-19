# 12

<img src="https://github.com/vpavlenko/12/assets/1491908/b02f2946-16be-4b79-a081-0e4cdd9b0122" width="200" align="right" />

```sql
SELECT *
FROM solo_info
JOIN composition_info ON solo_info.compid = composition_info.compid
WHERE composition_info.tonalitytype = 'BLUES'
AND composition_info.form = 'A12' AND solo_info.signature = '4/4'
AND (solo_info.key LIKE '%-maj' OR solo_info.key LIKE '%-min');
```

on [wjazzd.db](https://jazzomat.hfm-weimar.de/dbformat/dboverview.html)

[Recording metadata](data/wjd_recordings.json) and [annotations](public/wjd) come from the
[Weimar Jazz Database v2.1](https://jazzomat.hfm-weimar.de/download/download.html)
(SQLite version 2.2, ODbL). Join `solo_info.trackid` to `track_info.trackid`
and take the single calendar year in `track_info.recordingdate` for each `melid`.
The info icon beneath each roll opens its recording and transcription metadata.
Each solo has a shareable `#solo-<melid>` link.
To regenerate the metadata from the official SQLite download, run
`python3 scripts/export-wjd.py /path/to/wjazzd.db`.

## Recordings

Each solo plays the matching AAC excerpt from `public/audio/`.
[Playback metadata](data/playback.json) records each excerpt’s source video ID
and trim points. The player converts audio time to score time using the clip’s
score start and the number of recording seconds per score second. These values
were fit against the Weimar Jazz Database melody at several points in each solo
to account for both lead-in and transfer speed. The roll uses Weimar’s
transcribed note times and annotated beat times directly. Measure widths can
vary within a chorus. The footer uses the same note spans and committed tonic
changes, converted to the excerpt's clock.

The roll, Roman numeral tooltips, Piano Legend, size sliders, and fixed
playback bar use librawl.
The app runs on React 19 and pins a built librawl archive under `vendor/`.
It owns the audio element and maps its clock to the score and playback thumb
using annotated beat positions and recording-time playback spans. The sliders sit in the lower-right
corner. Use A/D to adjust time spacing and W/S to adjust note height.
The Piano Legend uses the credited [Salamander piano samples](public/piano/NOTICE.txt).

## Expressive MIDI

Each solo’s info panel links to a MIDI file timed to its local audio excerpt.
The export uses Weimar’s note transcription and `bend`, `slide`, `vibrato`, and
`fall-off` annotations. It adds MIDI pitch-wheel events using pitch estimates
from the recording where the tracker can follow the soloist. The other
gestures use approximations based on the annotation and available pitch
measurements. [The manifest](public/midi/manifest.json) records which method
was used for each gesture.

To regenerate the exports, install FFmpeg and the Python packages `mido`,
`numpy`, and `scipy`, then run `python3 scripts/export_expression_midi.py`.
The script reads the [Weimar Jazz Database extracts](public/wjd/NOTICE.txt)
and the local recordings.

Only the librawl archive pinned in `package.json` belongs in Git. When updating
the pin, stage the new archive with `git add -f` and remove the previous archive
from the Git index.
