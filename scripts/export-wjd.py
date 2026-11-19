#!/usr/bin/env python3
"""Export 12's catalogue from the Jazzomat Weimar Jazz Database v2.1 (ODbL)."""

import argparse
from collections import Counter
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import re
import sqlite3


DOWNLOAD_URL = 'https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db'
DATABASE_SHA256 = 'af6a0d9debf042c3581565bd75baad591d32e166cd2ec7298519883de614bf12'
SYNOPSIS_URL = 'https://jazzomat.hfm-weimar.de/dbformat/synopsis/solo{}.html'
BEAT_QUERY = '''
    SELECT beatid, onset, bar, beat, signature, chord, form, bass_pitch, chorus_id
    FROM beats WHERE melid = ? ORDER BY beatid
'''
SECTION_QUERY = '''
    SELECT type, start, end, value FROM sections WHERE melid = ? ORDER BY rowid
'''
NOTE_QUERY = '''
    SELECT eventid, onset, pitch, duration, period, division, bar, beat, tatum, subtatum,
           num, denom, beatprops, beatdur, tatumprops, loud_max, loud_med, loud_sd,
           loud_relpos, loud_cent, loud_s2b, f0_mod, f0_range, f0_freq_hz, f0_med_dev
    FROM melody WHERE melid = ? ORDER BY eventid
'''


def date_precision(value):
    if not value:
        return 'missing'
    if re.fullmatch(r'\d{4}', value):
        return 'year'
    if re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', value):
        return 'month'
    try:
        return 'day' if date.fromisoformat(value).isoformat() == value else 'other'
    except ValueError:
        return 'other'


def recording_year(value):
    years = set(re.findall(r'(?<!\d)(?:18|19|20)\d{2}(?!\d)', value or ''))
    return int(next(iter(years))) if len(years) == 1 else None


def lookup_recording(db, solo):
    identity_fields = ('melid', 'trackid', 'compid', 'recordid', 'performer', 'title',
                       'titleaddon', 'solopart')
    rows = db.execute('''
        SELECT s.melid, s.trackid, s.compid, s.recordid, s.performer, s.title,
               s.titleaddon, s.solopart, t.recordingdate, t.trackno, t.lineup, t.mbzid,
               r.recordtitle, r.label, r.releasedate, r.recordbib, r.artist,
               x.solotime, x.solostart_sec, x.status
        FROM solo_info s
        JOIN track_info t ON t.trackid = s.trackid
        JOIN record_info r ON r.recordid = s.recordid
        JOIN transcription_info x ON x.melid = s.melid AND x.trackid = s.trackid
        WHERE s.melid = ?
    ''', (solo['melid'],)).fetchall()
    if len(rows) != 1 or any(rows[0][field] != solo[field] for field in identity_fields):
        raise ValueError(f"Recording identity mismatch for solo {solo['melid']}")
    return {field: rows[0][field] for field in rows[0].keys() if field not in identity_fields}


def load_solo(db, solo):
    melid = solo['melid']
    recording = lookup_recording(db, solo)
    notes = [dict(row) for row in db.execute(NOTE_QUERY, (melid,))]
    beats = [dict(row) for row in db.execute(BEAT_QUERY, (melid,))]
    sections = [dict(row) for row in db.execute(SECTION_QUERY, (melid,))]
    if not notes or not beats or not sections:
        raise ValueError(f'Incomplete analysis for solo {melid}')

    # The section boundaries are inclusive zero-based note indices, not beat IDs.
    for section in sections:
        start = section['start']
        end = section['end']
        if not 0 <= start <= end < len(notes):
            raise ValueError(f'Invalid section boundaries for solo {melid}: {section}')
        section['start_time'] = notes[start]['onset']
        section['end_time'] = notes[end]['onset'] + notes[end]['duration']

    recording.update(
        source=SYNOPSIS_URL.format(melid),
        recordingdate_precision=date_precision(recording['recordingdate']),
        recording_year=recording_year(recording['recordingdate']),
        note_count=len(notes),
        beat_count=len(beats),
        section_counts=dict(Counter(section['type'] for section in sections)),
        first_note_onset=notes[0]['onset'],
        last_note_end=max(note['onset'] + note['duration'] for note in notes),
        pitch_min=min(note['pitch'] for note in notes),
        pitch_max=max(note['pitch'] for note in notes),
    )
    return recording, {'melid': melid, 'beats': beats, 'sections': sections, 'notes': notes}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    path.write_text(text + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path, help=f'Local copy of {DOWNLOAD_URL}')
    parser.add_argument('--catalog', type=Path, action='append')
    parser.add_argument('--output', type=Path, default=Path('.'))
    args = parser.parse_args()

    if sha256(args.database.read_bytes()).hexdigest() != DATABASE_SHA256:
        parser.error('The database does not match the official Weimar Jazz Database v2.1 checksum.')
    database_uri = args.database.resolve().as_uri() + '?mode=ro&immutable=1'
    db = sqlite3.connect(database_uri, uri=True)
    db.row_factory = sqlite3.Row
    if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
        parser.error('SQLite could not validate the source database.')

    catalogs = args.catalog or [Path('data/wjd_maj_blues.json'), Path('data/wjd_minor_blues.json')]
    solos = [solo for path in catalogs for solo in json.loads(path.read_text(encoding='utf-8'))]
    if len({solo['melid'] for solo in solos}) != len(solos):
        parser.error('The catalog repeats a solo ID.')
    catalog = {}
    details = {}
    for solo in sorted(solos, key=lambda row: row['melid']):
        melid = solo['melid']
        catalog[melid], details[melid] = load_solo(db, solo)
    db.close()

    write_json(args.output / 'data/wjd_recordings.json', catalog)
    for melid, detail in details.items():
        write_json(args.output / 'public/wjd' / f'{melid}.json', detail)
    totals = {name: sum(len(detail[name]) for detail in details.values())
              for name in ('notes', 'beats', 'sections')}
    print(json.dumps({'solos': len(catalog), **totals}))


if __name__ == '__main__':
    main()
