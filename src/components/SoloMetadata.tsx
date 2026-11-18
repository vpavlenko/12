import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { Note } from "tonal";
import { instrumentName, type JazzSolo, type WeimarRecording } from "../weimar";
import "./SoloMetadata.css";

type Cell = string | number | null | undefined;
type Annotation = Record<string, Cell>;
type Details = { beats: Annotation[]; sections: Annotation[]; notes: Annotation[] };
type Field = [label: string, value: ReactNode];
type Column = [field: string, label: string, format?: (value: Cell) => string];

const shortDate = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });
const number = new Intl.NumberFormat("en", { maximumFractionDigits: 3 });
const count = new Intl.NumberFormat("en");
const pageSize = 100;
const empty = "—";

function dateText(value: Cell) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return shortDate.format(new Date(`${value}T00:00:00Z`));
}

function numeral(value: Cell) {
  if (typeof value === "number") return number.format(value);
  if (value === "None" || value === "?") return empty;
  return value || empty;
}

function time(value: Cell) {
  if (typeof value !== "number") return numeral(value);
  const milliseconds = Math.round(Math.abs(value) * 1000);
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0");
  const fraction = String(milliseconds % 1000).padStart(3, "0");
  return `${value < 0 ? "−" : ""}${minutes}:${seconds}.${fraction}`;
}

function noteName(value: Cell) {
  if (typeof value !== "number") return numeral(value);
  const midi = Math.round(value);
  const name = accidentals(Note.fromMidi(midi));
  return midi === value ? name : `${name} (${numeral(value)})`;
}

function accidentals(value: string) {
  return value.replace(/([A-G])b/g, "$1♭").replace(/([A-G])#/g, "$1♯");
}

function chordName(value: Cell) {
  if (typeof value !== "string" || !value) return numeral(value);
  return accidentals(value).replace(/\bNC\b/g, "No chord")
    .replace(/([A-G][♭♯]?)-(?=\d|\s|\||\/|$)/g, "$1m")
    .replace(/([A-G][♭♯]?)j(?=\d)/g, "$1maj");
}

const displayCodes: Record<string, string> = {
  CHORD: "Chord", CHORUS: "Chorus", FORM: "Form", IDEA: "Playing idea", KEY: "Key", PHRASE: "Phrase",
  GREAT_AMERICAN_SONGBOOK: "Great American Songbook", "GREAT AMERICAN SONGBOOK": "Great American Songbook",
  HARDBOP: "Hard bop", POSTBOP: "Post-bop", MEDIUMUP: "Medium-up", MEDIUMSLOW: "Medium-slow",
  TWOBEAT: "Two-beat", PREFINAL: "Pre-final",
};

function codeName(value: Cell) {
  if (typeof value !== "string" || !value) return numeral(value);
  const description = value.toLowerCase().replace(/_/g, " ");
  return displayCodes[value] ?? description.charAt(0).toUpperCase() + description.slice(1);
}

function ideaName(value: Cell) {
  if (typeof value !== "string") return numeral(value);
  const category = value.match(/(?:^|[^a-z])(line|lick|melody|rhythm|expressive|theme|quote|void|fragment)(?![a-z])/i)?.[1];
  if (!category) return numeral(value);
  return value.toLowerCase() === category.toLowerCase() ? codeName(category) : `${codeName(category)} (${value})`;
}

function soloLineup(lineup: string) {
  return lineup.split(/;\s*/).map((entry) => entry.trim().replace(/\(([^()]+)\)$/, (_, codes: string) =>
    `(${codes.split(",").map(instrumentName).join(", ")})`));
}

const beatColumns: Column[] = [
  ["onset", "Solo time", time], ["bar", "Measure"], ["beat", "Beat"], ["signature", "Meter"],
  ["chord", "Chord", chordName], ["bass_pitch", "Bass", noteName], ["form", "Form"], ["chorus_id", "Chorus"],
];
const sectionTimingColumns: Column[] = [
  ["start_time", "Start", time], ["end_time", "End", time],
  ["start", "First note", (value) => numeral(typeof value === "number" ? value + 1 : value)],
  ["end", "Last note", (value) => numeral(typeof value === "number" ? value + 1 : value)],
];
const sectionTypes: [type: string, label: string, value: Column][] = [
  ["FORM", "Form sections", ["value", "Section"]],
  ["CHORUS", "Choruses", ["value", "Chorus"]],
  ["CHORD", "Chords", ["value", "Chord", chordName]],
  ["KEY", "Tonal centers", ["value", "Key"]],
  ["PHRASE", "Phrases", ["value", "Phrase"]],
  ["IDEA", "Playing ideas", ["value", "Idea", ideaName]],
];
const noteColumns: Column[] = [
  ["onset", "Solo time", time], ["pitch", "Pitch", noteName], ["duration", "Duration (s)"], ["bar", "Measure"], ["beat", "Beat"],
  ["f0_mod", "Pitch gesture", codeName], ["f0_range", "Range (¢)"], ["f0_freq_hz", "Rate (Hz)"], ["f0_med_dev", "Tuning (¢)"],
  ["loud_max", "Peak loudness"], ["loud_med", "Median loudness"], ["loud_sd", "Loudness SD"],
  ["loud_relpos", "Peak position"], ["loud_cent", "Loudness centroid"], ["loud_s2b", "Signal ratio"],
  ["period", "Beat period"], ["division", "Beat division"], ["tatum", "Tatum"], ["subtatum", "Subtatum"],
  ["num", "Meter numerator"], ["denom", "Meter denominator"], ["beatdur", "Beat length"],
  ["beatprops", "Beat ratios"], ["tatumprops", "Tatum ratios"],
];

function Properties({ name, fields }: { name: string; fields: Field[] }) {
  return <section>
    <h3>{name}</h3>
    <dl>{fields.filter(([, value]) => value != null && value !== "" && value !== "?").map(([label, value]) => (
      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
    ))}</dl>
  </section>;
}

function AnnotationTable({ label, columns, rows }: { label: string; columns: Column[]; rows: Annotation[] }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(rows.length / pageSize);
  return <details className="solo-metadata-table" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{label} <span>{count.format(rows.length)}</span></summary>
    {open && <>
      {pageCount > 1 && <div className="solo-metadata-pages">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
        <span>{page + 1} / {pageCount}</span>
        <button type="button" disabled={page + 1 === pageCount} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
      <div className="solo-metadata-scroll" role="region" aria-label={label} tabIndex={0}>
        <table aria-label={label}>
          <thead><tr>{columns.map(([key, heading]) => <th scope="col" key={key}>{heading}</th>)}</tr></thead>
          <tbody>{rows.slice(page * pageSize, (page + 1) * pageSize).map((row, index) => (
            <tr key={index}>{columns.map(([key, , format = numeral]) => <td key={key}>{format(row[key])}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </>}
  </details>;
}

function AnnotationDetails({ melid }: { melid: number }) {
  const [details, setDetails] = useState<Details>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}wjd/${melid}.json`, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json() as Promise<Details>;
    }).then((payload) => {
      if (!controller.signal.aborted) setDetails(payload);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [melid]);

  if (!details) return <p role="status">{failed ? "Annotations unavailable" : "Loading…"}</p>;
  return <>
    {sectionTypes.map(([type, label, value]) => {
      const rows = details.sections.filter((section) => section.type === type);
      return rows.length > 0 && <AnnotationTable key={type} label={label} columns={[value, ...sectionTimingColumns]} rows={rows} />;
    })}
    <AnnotationTable label="Beats" columns={beatColumns} rows={details.beats} />
    <AnnotationTable label="Notes" columns={noteColumns} rows={details.notes} />
  </>;
}

export function SoloMetadata({ solo, recording }: { solo: JazzSolo; recording: WeimarRecording }) {
  const [annotations, setAnnotations] = useState(false);
  const lineup = recording.lineup ? soloLineup(recording.lineup) : [];
  const showAnnotations = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (event.currentTarget.open) setAnnotations(true);
  };
  const key = accidentals(solo.key).replace(/-maj$/, " major").replace(/-min$/, " minor");
  const part = solo.solopart > 1 ? ` (${solo.solopart})` : "";
  return (
    <details className="solo-metadata">
      <summary className="solo-metadata-toggle" aria-label="Metadata" title="Metadata">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5m0-8h.01" />
        </svg>
      </summary>
      <section className="solo-metadata-content" aria-labelledby="solo-metadata-heading">
        <div className="solo-metadata-heading">
          <h2 id="solo-metadata-heading">Metadata</h2>
          <a href={recording.source} target="_blank" rel="noreferrer">Weimar entry</a>
          <a href={`${import.meta.env.BASE_URL}midi/${solo.melid}.mid`}
            download={`${solo.performer} - ${solo.title}${part}.mid`}>Expressive MIDI</a>
        </div>
        <div className="solo-metadata-groups">
          <Properties name="Recording" fields={[
            ["Recorded", dateText(recording.recordingdate)], ["Album", recording.recordtitle], ["Album artist", recording.artist],
            ["Label", recording.label], ["Catalogue no.", recording.recordbib], ["Released", dateText(recording.releasedate)],
            ["Track", recording.trackno], ["Solo in/out", recording.solotime?.replace(/\s*-\s*/g, "–")],
            ["Source offset", recording.solostart_sec == null ? undefined : time(recording.solostart_sec)],
            ["Weimar status", codeName(recording.status)], ["Solo ID", solo.melid],
            ["MusicBrainz", recording.mbzid ? <a href={`https://musicbrainz.org/recording/${recording.mbzid}`} target="_blank" rel="noreferrer">{recording.mbzid}</a> : undefined],
          ]} />
          <Properties name="Solo" fields={[
            ["Piece", [solo.title, solo.titleaddon].filter(Boolean).join(" ")], ["Performer", solo.performer],
            ["Instrument", instrumentName(solo.instrument)], ["Solo number", solo.solopart], ["Composer", solo.composer],
            ["Style", codeName(solo.style)], ["Genre", codeName(solo.genre)], ["Key", key], ["Meter", solo.signature],
            ["Mean tempo", `${numeral(solo.avgtempo)} bpm`], ["Tempo class", codeName(solo.tempoclass)], ["Feel", codeName(solo.rhythmfeel)],
            ["Form", solo.form.replace(/([A-Z]+)(\d+)/g, "$1 · $2 bars")], ["Template", solo.template],
            ["Tonality class", codeName(solo.tonalitytype)], ["Choruses", solo.chorus_count],
            ["Pitch range", `${noteName(recording.pitch_min)}–${noteName(recording.pitch_max)}`],
            ["Notes", count.format(recording.note_count)], ["Phrases", recording.section_counts.PHRASE],
            ["Playing ideas", recording.section_counts.IDEA],
          ]} />
        </div>
        {lineup.length > 0 && <section><h3>Lineup</h3><ul>{lineup.map((entry, index) => <li key={index}>{entry}</li>)}</ul></section>}
        {solo.chord_changes && <section><h3>Chord changes</h3><p className="solo-metadata-chords">{chordName(solo.chord_changes)}</p></section>}
        <details className="solo-metadata-annotations" onToggle={showAnnotations}>
          <summary>Annotations</summary>
          {annotations && <AnnotationDetails melid={solo.melid} />}
        </details>
      </section>
    </details>
  );
}
