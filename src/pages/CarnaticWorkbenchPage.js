import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
const pageViewOptions = [
    { value: "comparison", label: "Comparison" },
    { value: "student-focus", label: "Student focus" },
    { value: "teacher-focus", label: "Teacher focus" },
    { value: "side-by-side", label: "Side by side" }
];
const layerOptions = [
    { key: "layer1", label: "Frequency diagram" },
    { key: "layer2", label: "Phrasing" },
    { key: "layer3", label: "Notes" },
    { key: "layer4", label: "Dyanmics" },
    { key: "layer5", label: "Tone" }
];
const PLOT_LEFT_X = 28;
const MIN_PLOT_RIGHT_X = 98;
const PLOT_TOP_Y = 8;
const PLOT_BOTTOM_Y = 86;
const TIME_TICK_SECONDS = 1;
const X_UNITS_PER_SECOND = 40;
const MIN_SCROLLABLE_TIME_SECONDS = 25;
const CHART_SCROLL_HEIGHT_PX = 620;
const Y_UNITS_TO_PX = CHART_SCROLL_HEIGHT_PX / 100;
const CHART_PADDING_X_PX = 10;
const CHART_PADDING_TOP_PX = 8;
const CHART_PADDING_BOTTOM_PX = 8;
const DEFAULT_FOCUS_LOW_S_OFFSET = 0;
const DEFAULT_FOCUS_HIGH_S_OFFSET = 12;
const SWARA_MIN_OFFSET = -5;
const SWARA_MAX_OFFSET = 19;
const TRACE_SEMITONE_SHIFT = -12;
const PHRASING_MAX_BREATH_GAP_SECONDS = 0.32;
const PHRASING_SMOOTHING_WINDOW = 9;
const MAX_FREQUENCY_POINTS = 60000;
const RAGAM_NOTE_OPTIONS = [
    { id: "S", semitone: 0, color: "#92abff" },
    { id: "R1", semitone: 1, color: "#84b9ff" },
    { id: "R2", semitone: 2, color: "#7acbff" },
    { id: "R3", semitone: 3, color: "#6ddedc" },
    { id: "G1", semitone: 2, color: "#73d5ff" },
    { id: "G2", semitone: 3, color: "#68dfd1" },
    { id: "G3", semitone: 4, color: "#76e4b7" },
    { id: "M1", semitone: 5, color: "#9ce693" },
    { id: "M2", semitone: 6, color: "#c6ed88" },
    { id: "P", semitone: 7, color: "#f4df87" },
    { id: "D1", semitone: 8, color: "#ffcb8a" },
    { id: "D2", semitone: 9, color: "#ffb88e" },
    { id: "D3", semitone: 10, color: "#ffa7ac" },
    { id: "N1", semitone: 9, color: "#ffafc7" },
    { id: "N2", semitone: 10, color: "#eba9f9" },
    { id: "N3", semitone: 11, color: "#c7a5ff" }
];
const INCOMPATIBLE_RAGAM_NOTE_PAIRS = [
    ["R2", "G1"],
    ["R3", "G2"],
    ["R3", "G1"],
    ["D2", "N1"],
    ["D3", "N2"],
    ["D3", "N1"]
];
const DEFAULT_RAGAM_NOTES = ["S"];
const RAGAM_PRESETS = [
    { key: "shankarabaranam", name: "Shankarabaranam", notes: ["S", "R2", "G3", "M1", "P", "D2", "N3"] },
    { key: "mayamalavagowla", name: "Mayamalavagowla", notes: ["S", "R1", "G3", "M1", "P", "D1", "N3"] },
    { key: "nattai", name: "Nattai", notes: ["S", "R3", "G3", "M1", "P", "D3", "N3"] },
    { key: "kalyani", name: "Kalyani", notes: ["S", "R2", "G3", "M2", "P", "D2", "N3"] }
];
// Keeps ragam notes in the same canonical order used by the note grid.
function normalizeRagamNotes(noteIds) {
    const selected = new Set(noteIds);
    return RAGAM_NOTE_OPTIONS.map((note) => note.id).filter((noteId) => selected.has(noteId));
}
// Resolves a ragam preset from a typed name using case-insensitive matching.
function findRagamPresetByName(name) {
    const normalized = name.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    return RAGAM_PRESETS.find((preset) => preset.name.toLowerCase() === normalized) ?? null;
}
const SHRUTI_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SHRUTI_MIN_MIDI = 36; // C2
const SHRUTI_MAX_MIDI = 54; // F#3
const SHRUTI_OPTIONS = Array.from({ length: SHRUTI_MAX_MIDI - SHRUTI_MIN_MIDI + 1 }, (_, index) => {
    const midiNumber = SHRUTI_MIN_MIDI + index;
    const semitoneFromC = ((midiNumber % 12) + 12) % 12;
    const octave = Math.floor(midiNumber / 12) - 1;
    const hz = 440 * 2 ** ((midiNumber - 69) / 12);
    return { label: `${SHRUTI_NOTE_NAMES[semitoneFromC]}${octave}`, hz: Number(hz.toFixed(4)) };
});
const PITCH_MEDIAN_WINDOW = 5;
const PITCH_STICKY_CENTS = 16;
const PITCH_OCTAVE_RATIO_TOLERANCE = 0.28;
const PITCH_OCTAVE_ACCEPT_FRAMES = 6;
const PITCH_OCTAVE_SWITCH_MIN_SILENCE_FRAMES = 8;
const PITCH_LARGE_JUMP_CENTS = 620;
const PITCH_JUMP_ALIGNMENT_MIN_IMPROVEMENT_CENTS = 180;
const PITCH_SILENCE_RELEASE_FRAMES = 20;
const PITCH_BRIEF_HOLD_FRAMES = 0;
const DRONE_TONE_CENTS_TOLERANCE = 46;
const DRONE_SUPPRESSION_ALT_DB_WINDOW = 12;
const DRONE_SUPPRESSION_MIN_ALT_DB = -76;
const DRONE_REJECT_RMS_THRESHOLD = 0.014;
const DRONE_SIGNATURE_MIN_DB = -71;
const DRONE_SIGNATURE_MAX_DB_DELTA = 17;
// Returns absolute pitch distance in cents between two frequencies.
function absoluteCentsDelta(hzA, hzB) {
    if (hzA <= 0 || hzB <= 0) {
        return Infinity;
    }
    return Math.abs(1200 * Math.log2(hzA / hzB));
}
// Computes frame RMS to estimate how much voiced energy is present.
function getFrameRms(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
        const v = samples[i];
        sum += v * v;
    }
    return Math.sqrt(sum / Math.max(1, samples.length));
}
// Finds how close a frequency is to tanpura drone tones (S/P across octaves).
function centsToNearestDroneTone(hz, tonicHz) {
    if (hz <= 0 || tonicHz <= 0) {
        return Infinity;
    }
    // Tanpura reference tones: tonic (S) and fifth (P), across octaves.
    const droneSemitoneClasses = [0, 7];
    let best = Infinity;
    for (const semitoneClass of droneSemitoneClasses) {
        const baseRatio = 2 ** (semitoneClass / 12);
        for (let octaveShift = -3; octaveShift <= 3; octaveShift += 1) {
            const droneHz = tonicHz * baseRatio * 2 ** octaveShift;
            const cents = absoluteCentsDelta(hz, droneHz);
            if (cents < best) {
                best = cents;
            }
        }
    }
    return best;
}
// Detects whether a frequency is likely part of the tanpura drone.
function isDroneLikePitch(hz, tonicHz) {
    return centsToNearestDroneTone(hz, tonicHz) <= DRONE_TONE_CENTS_TOLERANCE;
}
// Finds cents distance to a specific note class (like tonic or fifth) across octaves.
function centsToNearestNoteClass(hz, tonicHz, semitoneClass) {
    if (hz <= 0 || tonicHz <= 0) {
        return Infinity;
    }
    let best = Infinity;
    const baseRatio = 2 ** (semitoneClass / 12);
    for (let octaveShift = -3; octaveShift <= 3; octaveShift += 1) {
        const candidateHz = tonicHz * baseRatio * 2 ** octaveShift;
        const cents = absoluteCentsDelta(hz, candidateHz);
        if (cents < best) {
            best = cents;
        }
    }
    return best;
}
// Detects whether the frame contains a tanpura-like S+P drone signature.
function hasDroneSignature(freqData, sampleRate, fftSize, tonicHz) {
    if (!freqData || sampleRate <= 0 || fftSize <= 0 || tonicHz <= 0) {
        return false;
    }
    // Require tonic and fifth in the same octave band so voice harmonics
    // do not get misclassified as an always-on drone.
    const octaveShifts = [-1, 0, 1, 2];
    for (const octaveShift of octaveShifts) {
        const sHz = tonicHz * 2 ** octaveShift;
        const pHz = tonicHz * 2 ** (octaveShift + 7 / 12);
        if (sHz < 60 || pHz < 60 || sHz > 900 || pHz > 1300) {
            continue;
        }
        const sDb = sampleSpectrumDbAtHz(freqData, sampleRate, fftSize, sHz);
        const pDb = sampleSpectrumDbAtHz(freqData, sampleRate, fftSize, pHz);
        if (!Number.isFinite(sDb) || !Number.isFinite(pDb)) {
            continue;
        }
        if (sDb < DRONE_SIGNATURE_MIN_DB || pDb < DRONE_SIGNATURE_MIN_DB) {
            continue;
        }
        const balance = Math.abs(sDb - pDb);
        if (balance <= DRONE_SIGNATURE_MAX_DB_DELTA) {
            return true;
        }
    }
    return false;
}
// Samples approximate dB value of the spectrum at a target frequency.
function sampleSpectrumDbAtHz(freqData, sampleRate, fftSize, hz) {
    if (!freqData || sampleRate <= 0 || fftSize <= 0 || hz <= 0) {
        return -120;
    }
    const rawBin = (hz * fftSize) / sampleRate;
    if (!Number.isFinite(rawBin) || rawBin <= 0) {
        return -120;
    }
    const maxBin = freqData.length - 1;
    const lowBin = Math.max(0, Math.min(maxBin, Math.floor(rawBin)));
    const highBin = Math.max(0, Math.min(maxBin, lowBin + 1));
    const weight = Math.max(0, Math.min(1, rawBin - lowBin));
    const lowDb = Number.isFinite(freqData[lowBin]) ? freqData[lowBin] : -120;
    const highDb = Number.isFinite(freqData[highBin]) ? freqData[highBin] : -120;
    return lowDb + (highDb - lowDb) * weight;
}
// Prefers lower-octave S/P candidates when their spectral energy is still strong.
function preferLowerDroneRegister(detectedHz, freqData, sampleRate, fftSize, tonicHz) {
    if (!freqData || detectedHz <= 0) {
        return detectedHz;
    }
    let bestHz = detectedHz;
    let bestDb = sampleSpectrumDbAtHz(freqData, sampleRate, fftSize, detectedHz);
    let candidate = detectedHz;
    for (let step = 0; step < 3; step += 1) {
        const half = candidate / 2;
        if (half < 70) {
            break;
        }
        if (!isDroneLikePitch(half, tonicHz)) {
            candidate = half;
            continue;
        }
        const halfDb = sampleSpectrumDbAtHz(freqData, sampleRate, fftSize, half);
        if (halfDb >= bestDb - 9) {
            bestHz = half;
            bestDb = halfDb;
        }
        candidate = half;
    }
    return bestHz;
}
// Picks a strong non-drone spectral peak when drone tones dominate the frame.
function pickAlternateNonDronePeakHz(freqData, sampleRate, fftSize, tonicHz) {
    const peaks = [];
    for (let bin = 2; bin < freqData.length - 1; bin += 1) {
        const db = freqData[bin];
        if (!Number.isFinite(db) || db < -92) {
            continue;
        }
        if (db < freqData[bin - 1] || db < freqData[bin + 1]) {
            continue;
        }
        const hz = (bin * sampleRate) / fftSize;
        if (hz < 70 || hz > 1400) {
            continue;
        }
        peaks.push({ hz, db, droneLike: isDroneLikePitch(hz, tonicHz) });
    }
    if (peaks.length === 0) {
        return null;
    }
    peaks.sort((a, b) => b.db - a.db);
    const strongest = peaks[0];
    const strongestNonDrone = peaks.find((peak) => !peak.droneLike);
    if (!strongestNonDrone) {
        return null;
    }
    if (strongest.droneLike &&
        strongestNonDrone.db >= strongest.db - DRONE_SUPPRESSION_ALT_DB_WINDOW &&
        strongestNonDrone.db >= DRONE_SUPPRESSION_MIN_ALT_DB) {
        return strongestNonDrone.hz;
    }
    return null;
}
// Suppresses drone-locked detections and keeps likely singer pitch candidates.
function suppressDroneLockedPitch(detectedHz, freqData, sampleRate, fftSize, tonicHz, droneSignaturePresent, frameRms, lastStableHz) {
    if (!isDroneLikePitch(detectedHz, tonicHz)) {
        return detectedHz;
    }
    if (!droneSignaturePresent) {
        return detectedHz;
    }
    const singerDominantFrame = frameRms >= DRONE_REJECT_RMS_THRESHOLD * 2.8;
    if (singerDominantFrame) {
        return detectedHz;
    }
    const alternateHz = freqData !== null ? pickAlternateNonDronePeakHz(freqData, sampleRate, fftSize, tonicHz) : null;
    if (alternateHz !== null) {
        if (lastStableHz === null) {
            return alternateHz;
        }
        const alternateDelta = absoluteCentsDelta(alternateHz, lastStableHz);
        const detectedDelta = absoluteCentsDelta(detectedHz, lastStableHz);
        if (alternateDelta + 90 < detectedDelta) {
            return alternateHz;
        }
    }
    const lowerPreferredHz = preferLowerDroneRegister(detectedHz, freqData, sampleRate, fftSize, tonicHz);
    if (lowerPreferredHz < detectedHz * 0.76) {
        if (lastStableHz === null) {
            return lowerPreferredHz;
        }
        const lowerDelta = absoluteCentsDelta(lowerPreferredHz, lastStableHz);
        const detectedDelta = absoluteCentsDelta(detectedHz, lastStableHz);
        if (lowerDelta + 85 < detectedDelta) {
            return lowerPreferredHz;
        }
    }
    // If we only hear tonic/fifth and the frame is weak, treat as drone-only.
    if (frameRms < DRONE_REJECT_RMS_THRESHOLD) {
        return null;
    }
    return detectedHz;
}
// Octave-aligns a detected pitch to stay continuous with a reference pitch.
function alignOctaveToReference(hz, referenceHz) {
    if (hz <= 0 || referenceHz <= 0) {
        return hz;
    }
    let bestHz = hz;
    let bestCents = absoluteCentsDelta(hz, referenceHz);
    for (let shift = -2; shift <= 2; shift += 1) {
        const candidateHz = hz * 2 ** shift;
        if (candidateHz <= 0) {
            continue;
        }
        const candidateCents = absoluteCentsDelta(candidateHz, referenceHz);
        if (candidateCents < bestCents) {
            bestHz = candidateHz;
            bestCents = candidateCents;
        }
    }
    return bestHz;
}
// Detects fundamental frequency from time-domain samples using YIN-style analysis.
function detectFundamentalHz(samples, sampleRate) {
    let mean = 0;
    for (let i = 0; i < samples.length; i += 1) {
        mean += samples[i];
    }
    mean /= samples.length;
    let rms = 0;
    for (let i = 0; i < samples.length; i += 1) {
        const v = samples[i] - mean;
        rms += v * v;
    }
    rms = Math.sqrt(rms / samples.length);
    if (rms < 0.007) {
        return null;
    }
    // Gently attenuate higher harmonics before YIN to reduce octave-up locking.
    const lowpassCutoffHz = 1200;
    const alpha = (2 * Math.PI * lowpassCutoffHz) / (2 * Math.PI * lowpassCutoffHz + sampleRate);
    const filtered = new Float32Array(samples.length);
    let previous = 0;
    for (let i = 0; i < samples.length; i += 1) {
        const centered = samples[i] - mean;
        previous += alpha * (centered - previous);
        filtered[i] = previous;
    }
    // YIN-style pitch detection to reduce overtone locking.
    const minLag = Math.floor(sampleRate / 900); // ~F5 upper voice area
    const maxLag = Math.floor(sampleRate / 50); // keep low-note headroom
    if (maxLag >= samples.length - 2) {
        return null;
    }
    const yin = new Float32Array(maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag += 1) {
        let sum = 0;
        for (let i = 0; i < samples.length - lag; i += 1) {
            const delta = filtered[i] - filtered[i + lag];
            sum += delta * delta;
        }
        yin[lag] = sum;
    }
    let runningSum = 0;
    yin[0] = 1;
    for (let lag = 1; lag <= maxLag; lag += 1) {
        runningSum += yin[lag];
        yin[lag] = runningSum > 0 ? (yin[lag] * lag) / runningSum : 1;
    }
    const threshold = 0.13;
    let candidateLag = -1;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
        if (yin[lag] < threshold) {
            let bestLag = lag;
            while (bestLag + 1 <= maxLag && yin[bestLag + 1] < yin[bestLag]) {
                bestLag += 1;
            }
            candidateLag = bestLag;
            break;
        }
    }
    if (candidateLag <= 1 || candidateLag >= maxLag || yin[candidateLag] > 0.25) {
        return null;
    }
    // Keep the raw YIN candidate by default to avoid downward octave bias.
    let correctedLag = candidateLag;
    const y0 = yin[correctedLag - 1];
    const y1 = yin[correctedLag];
    const y2 = yin[correctedLag + 1];
    const denominator = 2 * (2 * y1 - y2 - y0);
    const lagRefined = denominator !== 0 ? correctedLag + (y2 - y0) / denominator : correctedLag;
    if (!Number.isFinite(lagRefined) || lagRefined <= 0) {
        return null;
    }
    return sampleRate / lagRefined;
}
// Builds y-axis guide metadata from the selected ragam notes and octave markers.
function buildSwaraGuides(selectedNotes) {
    const selectedSet = new Set(selectedNotes);
    const semitoneMap = new Map();
    for (const note of RAGAM_NOTE_OPTIONS) {
        if (!selectedSet.has(note.id)) {
            continue;
        }
        const existing = semitoneMap.get(note.semitone);
        if (!existing) {
            semitoneMap.set(note.semitone, { labels: [note.id], color: note.color });
            continue;
        }
        existing.labels.push(note.id);
    }
    const guides = [];
    for (let offset = SWARA_MIN_OFFSET; offset <= SWARA_MAX_OFFSET; offset += 1) {
        const semitone = ((offset % 12) + 12) % 12;
        const noteForSemitone = semitoneMap.get(semitone);
        if (!noteForSemitone) {
            continue;
        }
        const octaveShiftFromMid = Math.floor(offset / 12);
        let octaveMarker = "";
        if (octaveShiftFromMid > 0) {
            octaveMarker = "'".repeat(octaveShiftFromMid);
        }
        else if (octaveShiftFromMid < 0) {
            octaveMarker = "_".repeat(Math.abs(octaveShiftFromMid));
        }
        guides.push({
            offset,
            label: `${noteForSemitone.labels.join("/")}${octaveMarker}`,
            color: noteForSemitone.color
        });
    }
    return guides;
}
// Converts a frequency-over-time series into an SVG path.
function buildTracePath(series, tonicHz) {
    if (series.length < 2) {
        return "";
    }
    return series
        .reduce((commands, point) => {
        const x = PLOT_LEFT_X + point.t * X_UNITS_PER_SECOND;
        if (point.hz === null || point.hz <= 0) {
            commands.push("|");
            return commands;
        }
        const semitoneOffsetFromTonic = 12 * Math.log2(point.hz / tonicHz) + TRACE_SEMITONE_SHIFT;
        const normalizedFrequency = (semitoneOffsetFromTonic - SWARA_MIN_OFFSET) / (SWARA_MAX_OFFSET - SWARA_MIN_OFFSET);
        const yVirtual = PLOT_BOTTOM_Y - normalizedFrequency * (PLOT_BOTTOM_Y - PLOT_TOP_Y);
        const y = yVirtual * Y_UNITS_TO_PX;
        const previous = commands[commands.length - 1];
        const command = `${previous === undefined || previous === "|" ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
        commands.push(command);
        return commands;
    }, [])
        .filter((command) => command !== "|")
        .join(" ");
}
// Converts a semitone offset to chart y-position in pixels.
function semitoneOffsetToY(offset) {
    const normalizedFrequency = (offset - SWARA_MIN_OFFSET) / (SWARA_MAX_OFFSET - SWARA_MIN_OFFSET);
    const yVirtual = PLOT_BOTTOM_Y - normalizedFrequency * (PLOT_BOTTOM_Y - PLOT_TOP_Y);
    return yVirtual * Y_UNITS_TO_PX;
}
// Normalizes RMS to a 0..1 loudness value for dynamics rendering.
function rmsToNormalizedLoudness(rms) {
    if (!Number.isFinite(rms) || rms <= 0) {
        return 0;
    }
    const db = 20 * Math.log10(rms);
    const normalized = (db + 62) / 40;
    return Math.max(0, Math.min(1, normalized));
}
// Estimates breathiness from spectral high-frequency energy and flatness.
function estimateBreathiness(freqData, sampleRate, fftSize, frameRms) {
    if (!freqData || !Number.isFinite(sampleRate) || sampleRate <= 0 || fftSize <= 0 || frameRms < 0.006) {
        return 0;
    }
    let totalPower = 0;
    let highBandPower = 0;
    let flatPowerSum = 0;
    let flatLogPowerSum = 0;
    let flatCount = 0;
    for (let bin = 2; bin < freqData.length; bin += 1) {
        const db = freqData[bin];
        if (!Number.isFinite(db) || db < -120) {
            continue;
        }
        const hz = (bin * sampleRate) / fftSize;
        if (hz < 120 || hz > 7000) {
            continue;
        }
        const power = 10 ** (db / 10);
        if (!Number.isFinite(power) || power <= 0) {
            continue;
        }
        totalPower += power;
        if (hz >= 2200) {
            highBandPower += power;
        }
        if (hz >= 1000 && hz <= 6000) {
            flatPowerSum += power;
            flatLogPowerSum += Math.log(power);
            flatCount += 1;
        }
    }
    if (totalPower <= 1e-12) {
        return 0;
    }
    const highRatio = highBandPower / totalPower;
    let flatness = 0;
    if (flatCount > 0 && flatPowerSum > 1e-12) {
        const geometricMean = Math.exp(flatLogPowerSum / flatCount);
        const arithmeticMean = flatPowerSum / flatCount;
        flatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;
    }
    const rawBreathiness = 0.62 * highRatio + 0.38 * flatness;
    const normalizedBreathiness = Math.max(0, Math.min(1, (rawBreathiness - 0.03) / 0.32));
    const rmsWeight = Math.max(0, Math.min(1, (frameRms - 0.008) / 0.07));
    return normalizedBreathiness * (0.65 + 0.35 * rmsWeight);
}
// Finds where the trace crosses note guide lines and returns dot positions.
function buildNoteHitPoints(series, tonicHz, noteOffsets) {
    if (series.length < 2 || noteOffsets.length === 0 || tonicHz <= 0) {
        return [];
    }
    const sortedOffsets = [...new Set(noteOffsets)].sort((a, b) => a - b);
    const hits = [];
    const lastXByOffset = new Map();
    for (let index = 1; index < series.length; index += 1) {
        const previous = series[index - 1];
        const current = series[index];
        if (!previous.hz || !current.hz || previous.hz <= 0 || current.hz <= 0) {
            continue;
        }
        const previousOffset = 12 * Math.log2(previous.hz / tonicHz) + TRACE_SEMITONE_SHIFT;
        const currentOffset = 12 * Math.log2(current.hz / tonicHz) + TRACE_SEMITONE_SHIFT;
        if (!Number.isFinite(previousOffset) || !Number.isFinite(currentOffset)) {
            continue;
        }
        const low = Math.min(previousOffset, currentOffset);
        const high = Math.max(previousOffset, currentOffset);
        const span = currentOffset - previousOffset;
        for (const noteOffset of sortedOffsets) {
            if (noteOffset < low - 0.001 || noteOffset > high + 0.001) {
                continue;
            }
            let timeAtHit = current.t;
            if (Math.abs(span) > 1e-6) {
                const ratio = (noteOffset - previousOffset) / span;
                if (ratio < 0 || ratio > 1) {
                    continue;
                }
                timeAtHit = previous.t + (current.t - previous.t) * ratio;
            }
            else if (Math.abs(currentOffset - noteOffset) > 0.09) {
                continue;
            }
            const x = PLOT_LEFT_X + timeAtHit * X_UNITS_PER_SECOND;
            const priorX = lastXByOffset.get(noteOffset);
            if (priorX !== undefined && x - priorX < 3) {
                continue;
            }
            lastXByOffset.set(noteOffset, x);
            hits.push({
                key: `${noteOffset}-${timeAtHit.toFixed(3)}-${index}`,
                x,
                y: semitoneOffsetToY(noteOffset)
            });
        }
    }
    return hits;
}
// Builds vertical contour lines from trace to x-axis based on loudness.
function buildDynamicsLines(series, tonicHz) {
    if (series.length < 2 || tonicHz <= 0) {
        return [];
    }
    const lines = [];
    const yBottom = PLOT_BOTTOM_Y * Y_UNITS_TO_PX;
    let lastX = -Infinity;
    for (let index = 0; index < series.length; index += 1) {
        const point = series[index];
        if (point.hz === null || point.hz <= 0) {
            continue;
        }
        const semitoneOffsetFromTonic = 12 * Math.log2(point.hz / tonicHz) + TRACE_SEMITONE_SHIFT;
        if (!Number.isFinite(semitoneOffsetFromTonic)) {
            continue;
        }
        const x = PLOT_LEFT_X + point.t * X_UNITS_PER_SECOND;
        const yTop = semitoneOffsetToY(semitoneOffsetFromTonic);
        const loudness = Math.max(0, Math.min(1, point.amp ?? 0));
        // Louder phrases get denser lines, softer phrases get more spacing.
        const minSpacingPx = 2.2;
        const maxSpacingPx = 24;
        const spacing = maxSpacingPx - (maxSpacingPx - minSpacingPx) * loudness;
        if (x - lastX < spacing) {
            continue;
        }
        lastX = x;
        lines.push({
            key: `${index}-${x.toFixed(2)}`,
            x,
            yTop,
            yBottom,
            opacity: 0.1 + loudness * 0.82,
            strokeWidth: 0.25 + loudness * 3.1
        });
    }
    return lines;
}
// Builds glow points around the trace where breathiness is higher.
function buildToneHazePoints(series, tonicHz) {
    if (series.length < 2 || tonicHz <= 0) {
        return [];
    }
    const hazePoints = [];
    let lastX = -Infinity;
    for (let index = 0; index < series.length; index += 1) {
        const point = series[index];
        if (point.hz === null || point.hz <= 0) {
            continue;
        }
        const tone = Math.max(0, Math.min(1, point.tone ?? 0));
        if (tone <= 0.005) {
            continue;
        }
        const semitoneOffsetFromTonic = 12 * Math.log2(point.hz / tonicHz) + TRACE_SEMITONE_SHIFT;
        if (!Number.isFinite(semitoneOffsetFromTonic)) {
            continue;
        }
        const x = PLOT_LEFT_X + point.t * X_UNITS_PER_SECOND;
        const y = semitoneOffsetToY(semitoneOffsetFromTonic);
        // Breathier tone = denser haze and larger glow.
        const spacing = 7 - tone * 5;
        if (x - lastX < spacing) {
            continue;
        }
        lastX = x;
        hazePoints.push({
            key: `${index}-${x.toFixed(2)}`,
            x,
            y,
            radius: 4 + tone * 14,
            opacity: 0.14 + tone * 0.5
        });
    }
    return hazePoints;
}
// Generates a smoothed phrasing layer and bridges short breath gaps.
function buildPhrasingSeries(series) {
    if (series.length < 2) {
        return series;
    }
    const bridged = series.map((point) => ({ ...point }));
    let index = 0;
    while (index < bridged.length) {
        if (bridged[index].hz !== null) {
            index += 1;
            continue;
        }
        const gapStart = index;
        while (index < bridged.length && bridged[index].hz === null) {
            index += 1;
        }
        const gapEnd = index - 1;
        const leftPoint = gapStart > 0 ? bridged[gapStart - 1] : null;
        const rightPoint = index < bridged.length ? bridged[index] : null;
        if (leftPoint?.hz === null || leftPoint?.hz === undefined || rightPoint?.hz === null || rightPoint?.hz === undefined) {
            continue;
        }
        const gapDuration = rightPoint.t - leftPoint.t;
        if (gapDuration > PHRASING_MAX_BREATH_GAP_SECONDS || gapDuration <= 0) {
            continue;
        }
        const leftHz = leftPoint.hz;
        const rightHz = rightPoint.hz;
        if (leftHz === null || rightHz === null) {
            continue;
        }
        for (let i = gapStart; i <= gapEnd; i += 1) {
            const ratio = (bridged[i].t - leftPoint.t) / (rightPoint.t - leftPoint.t || 1);
            const interpolated = leftHz + (rightHz - leftHz) * Math.min(1, Math.max(0, ratio));
            const leftAmp = leftPoint.amp ?? 0;
            const rightAmp = rightPoint.amp ?? 0;
            const interpolatedAmp = leftAmp + (rightAmp - leftAmp) * Math.min(1, Math.max(0, ratio));
            const leftTone = leftPoint.tone ?? 0;
            const rightTone = rightPoint.tone ?? 0;
            const interpolatedTone = leftTone + (rightTone - leftTone) * Math.min(1, Math.max(0, ratio));
            bridged[i] = { t: bridged[i].t, hz: interpolated, amp: interpolatedAmp, tone: interpolatedTone };
        }
    }
    const smoothed = bridged.map((point) => ({ ...point }));
    const halfWindow = Math.floor(PHRASING_SMOOTHING_WINDOW / 2);
    let segmentStart = 0;
    while (segmentStart < bridged.length) {
        if (bridged[segmentStart].hz === null) {
            segmentStart += 1;
            continue;
        }
        let segmentEnd = segmentStart;
        while (segmentEnd + 1 < bridged.length && bridged[segmentEnd + 1].hz !== null) {
            segmentEnd += 1;
        }
        for (let i = segmentStart; i <= segmentEnd; i += 1) {
            let logSum = 0;
            let count = 0;
            for (let j = i - halfWindow; j <= i + halfWindow; j += 1) {
                if (j < segmentStart || j > segmentEnd) {
                    continue;
                }
                const hz = bridged[j].hz;
                if (hz === null || hz <= 0) {
                    continue;
                }
                logSum += Math.log2(hz);
                count += 1;
            }
            if (count > 0) {
                smoothed[i] = { t: bridged[i].t, hz: 2 ** (logSum / count), amp: bridged[i].amp, tone: bridged[i].tone };
            }
        }
        segmentStart = segmentEnd + 1;
    }
    return smoothed;
}
// Stops and clears any scheduled audio nodes safely.
function stopScheduledSources(sources) {
    for (const source of sources) {
        try {
            source.stop();
        }
        catch {
            // Source may already be stopped.
        }
    }
    sources.length = 0;
}
// Schedules one tanpura-like pluck with harmonics and a short noise transient.
function scheduleTanpuraStroke(audioContext, baseHz, startTime, sources) {
    const strokeDuration = 0.86;
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.exponentialRampToValueAtTime(0.34, startTime + 0.038);
    envelope.gain.exponentialRampToValueAtTime(0.17, startTime + 0.24);
    envelope.gain.exponentialRampToValueAtTime(0.09, startTime + 0.86);
    envelope.gain.exponentialRampToValueAtTime(0.006, startTime + strokeDuration);
    const bodyFilter = audioContext.createBiquadFilter();
    bodyFilter.type = "bandpass";
    bodyFilter.frequency.setValueAtTime(Math.min(2600, baseHz * 2.8), startTime);
    bodyFilter.Q.value = 0.78;
    const toneFilter = audioContext.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.setValueAtTime(3200, startTime);
    toneFilter.Q.value = 0.3;
    bodyFilter.connect(toneFilter);
    toneFilter.connect(envelope);
    envelope.connect(audioContext.destination);
    const harmonicMultipliers = [1, 2, 3, 4, 5];
    const harmonicGains = [0.22, 0.2, 0.14, 0.08, 0.05];
    for (let i = 0; i < harmonicMultipliers.length; i += 1) {
        const oscillator = audioContext.createOscillator();
        const harmonicGain = audioContext.createGain();
        oscillator.type = i === 0 ? "sawtooth" : "triangle";
        oscillator.frequency.setValueAtTime(baseHz * harmonicMultipliers[i], startTime);
        oscillator.detune.setValueAtTime((i - 2) * 3, startTime);
        harmonicGain.gain.setValueAtTime(harmonicGains[i], startTime);
        oscillator.connect(harmonicGain);
        harmonicGain.connect(bodyFilter);
        oscillator.start(startTime);
        oscillator.stop(startTime + strokeDuration);
        sources.push(oscillator);
    }
    const noiseDuration = 0.03;
    const noiseFrameCount = Math.max(1, Math.floor(audioContext.sampleRate * noiseDuration));
    const noiseBuffer = audioContext.createBuffer(1, noiseFrameCount, audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1) {
        noiseData[i] = Math.random() * 2 - 1;
    }
    const noiseSource = audioContext.createBufferSource();
    const noiseFilter = audioContext.createBiquadFilter();
    const noiseGain = audioContext.createGain();
    noiseSource.buffer = noiseBuffer;
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(900, startTime);
    noiseGain.gain.setValueAtTime(0.018, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + noiseDuration);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(bodyFilter);
    noiseSource.start(startTime);
    noiseSource.stop(startTime + noiseDuration);
    sources.push(noiseSource);
}
// Teacher avatar used in the upper graph card.
function TeacherLogo() {
    return (_jsxs("svg", { viewBox: "0 0 64 64", "aria-hidden": "true", children: [_jsx("circle", { cx: "32", cy: "32", r: "29", className: "logo-backdrop logo-teacher" }), _jsx("path", { d: "M12 27L32 18L52 27L32 36L12 27ZM22 31V37C22 42 27 45 32 45C37 45 42 42 42 37V31L32 36L22 31Z", className: "logo-symbol" }), _jsx("circle", { cx: "49", cy: "30", r: "3", className: "logo-symbol" })] }));
}
// Student avatar used in the lower graph card.
function StudentLogo() {
    return (_jsxs("svg", { viewBox: "0 0 64 64", "aria-hidden": "true", children: [_jsx("circle", { cx: "32", cy: "32", r: "29", className: "logo-backdrop logo-student" }), _jsx("circle", { cx: "32", cy: "25", r: "9", className: "logo-symbol" }), _jsx("path", { d: "M16 47C16 38.8 23 34 32 34C41 34 48 38.8 48 47V51H16V47Z", className: "logo-symbol" })] }));
}
// Graph panel component with recording, rendering, and per-layer visualization.
function GraphCard({ logo, className, bpm, tonicHz, tonicLabel, swaraGuides, showFrequencyDiagram, showPhrasing, showNotes, showDynamics, showTone, canRecord, hasShrutiSet, hasRagamSet, hasTalamSet, shrutiButtonLabel, talamButtonLabel, ragamButtonLabel, setupOverlayDismissed, onBpmChange, onOpenPopup, onDismissSetupOverlay, onRecordingStateChange }) {
    const label = logo === "teacher" ? "Teacher channel" : "Student channel";
    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioPlaybackRef = useRef(null);
    const analysisAudioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const analyserDataRef = useRef(null);
    const analyserFreqDataRef = useRef(null);
    const chartWrapRef = useRef(null);
    const chartRef = useRef(null);
    const hasSetInitialVerticalFocusRef = useRef(false);
    const recordingStartMsRef = useRef(0);
    const pitchHistoryRef = useRef([]);
    const lastStableHzRef = useRef(null);
    const silenceFramesRef = useRef(0);
    const octaveCandidateRef = useRef(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingProgress, setRecordingProgress] = useState(0);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
    const [isPlayingBack, setIsPlayingBack] = useState(false);
    const [frequencySeries, setFrequencySeries] = useState([]);
    const [chartScrollState, setChartScrollState] = useState({
        left: 0,
        top: 0,
        width: 0,
        height: 0
    });
    const recorderSupported = typeof window !== "undefined" &&
        typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices !== "undefined" &&
        typeof navigator.mediaDevices.getUserMedia === "function" &&
        typeof MediaRecorder !== "undefined";
    useEffect(() => {
        onRecordingStateChange(isRecording);
    }, [isRecording, onRecordingStateChange]);
    useEffect(() => {
        return () => {
            onRecordingStateChange(false);
        };
    }, [onRecordingStateChange]);
    useEffect(() => {
        if (!isRecording) {
            return;
        }
        const intervalId = window.setInterval(() => {
            setRecordingProgress((prev) => Math.min(prev + 1, 100));
        }, 120);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [isRecording]);
    useEffect(() => {
        if (!isRecording) {
            return;
        }
        const intervalId = window.setInterval(() => {
            const analyser = analyserRef.current;
            const analyserData = analyserDataRef.current;
            const audioContext = analysisAudioContextRef.current;
            const previousSilenceFrames = silenceFramesRef.current;
            if (!analyser || !analyserData || !audioContext) {
                return;
            }
            analyser.getFloatTimeDomainData(analyserData);
            const frameRms = getFrameRms(analyserData);
            const loudness = rmsToNormalizedLoudness(frameRms);
            const freqData = analyserFreqDataRef.current;
            if (freqData) {
                analyser.getFloatFrequencyData(freqData);
            }
            const droneSignaturePresent = hasDroneSignature(freqData, audioContext.sampleRate, analyser.fftSize, tonicHz);
            const breathiness = estimateBreathiness(freqData, audioContext.sampleRate, analyser.fftSize, frameRms);
            const rawDetectedHz = detectFundamentalHz(analyserData, audioContext.sampleRate);
            const lastStableHz = lastStableHzRef.current;
            const detectedHz = rawDetectedHz !== null
                ? suppressDroneLockedPitch(rawDetectedHz, freqData, audioContext.sampleRate, analyser.fftSize, tonicHz, droneSignaturePresent, frameRms, lastStableHz)
                : null;
            let displayHz = null;
            if (detectedHz !== null) {
                const history = [...pitchHistoryRef.current, detectedHz].slice(-PITCH_MEDIAN_WINDOW);
                pitchHistoryRef.current = history;
                const sorted = [...history].sort((a, b) => a - b);
                displayHz = sorted[Math.floor(sorted.length / 2)];
                if (lastStableHz !== null && displayHz > 0) {
                    const continuityAlignedHz = alignOctaveToReference(displayHz, lastStableHz);
                    const rawCentsDelta = absoluteCentsDelta(displayHz, lastStableHz);
                    const alignedCentsDelta = absoluteCentsDelta(continuityAlignedHz, lastStableHz);
                    if (previousSilenceFrames < PITCH_OCTAVE_SWITCH_MIN_SILENCE_FRAMES &&
                        droneSignaturePresent &&
                        isDroneLikePitch(displayHz, tonicHz) &&
                        rawCentsDelta >= PITCH_LARGE_JUMP_CENTS &&
                        alignedCentsDelta + PITCH_JUMP_ALIGNMENT_MIN_IMPROVEMENT_CENTS < rawCentsDelta) {
                        displayHz = continuityAlignedHz;
                    }
                    const centsDelta = absoluteCentsDelta(displayHz, lastStableHz);
                    if (centsDelta < PITCH_STICKY_CENTS) {
                        displayHz = lastStableHz;
                        octaveCandidateRef.current = null;
                    }
                    else {
                        const ratioLog2 = Math.log2(displayHz / lastStableHz);
                        const looksLikeOctaveFlip = Number.isFinite(ratioLog2) &&
                            Math.abs(Math.abs(ratioLog2) - 1) <= PITCH_OCTAVE_RATIO_TOLERANCE;
                        if (looksLikeOctaveFlip) {
                            const octaveAlignedHz = ratioLog2 > 0 ? displayHz / 2 : displayHz * 2;
                            const shouldUseOctaveGuard = droneSignaturePresent;
                            if (!shouldUseOctaveGuard) {
                                octaveCandidateRef.current = null;
                            }
                            else {
                                const shouldForceFastAlignment = previousSilenceFrames < PITCH_OCTAVE_SWITCH_MIN_SILENCE_FRAMES &&
                                    droneSignaturePresent &&
                                    isDroneLikePitch(displayHz, tonicHz);
                                if (shouldForceFastAlignment) {
                                    displayHz = octaveAlignedHz;
                                    octaveCandidateRef.current = null;
                                }
                                else {
                                    const direction = displayHz > lastStableHz ? 1 : -1;
                                    const currentCandidate = octaveCandidateRef.current;
                                    const sameDirection = currentCandidate !== null && currentCandidate.direction === direction;
                                    const similarPitch = currentCandidate !== null &&
                                        absoluteCentsDelta(currentCandidate.hz, displayHz) <= 70;
                                    if (sameDirection && similarPitch) {
                                        octaveCandidateRef.current = {
                                            hz: displayHz,
                                            direction,
                                            frames: currentCandidate.frames + 1
                                        };
                                    }
                                    else {
                                        octaveCandidateRef.current = { hz: displayHz, direction, frames: 1 };
                                    }
                                    if ((octaveCandidateRef.current?.frames ?? 0) < PITCH_OCTAVE_ACCEPT_FRAMES) {
                                        displayHz = octaveAlignedHz;
                                    }
                                    else {
                                        octaveCandidateRef.current = null;
                                    }
                                }
                            }
                        }
                        else {
                            octaveCandidateRef.current = null;
                        }
                    }
                }
            }
            else {
                pitchHistoryRef.current = [];
                const holdHz = lastStableHzRef.current;
                if (holdHz !== null && previousSilenceFrames < PITCH_BRIEF_HOLD_FRAMES) {
                    // Keep short unvoiced dropouts from causing octave re-locks on re-entry.
                    displayHz = holdHz;
                }
            }
            if (displayHz !== null) {
                lastStableHzRef.current = displayHz;
                silenceFramesRef.current = 0;
            }
            else {
                silenceFramesRef.current += 1;
                if (silenceFramesRef.current >= PITCH_SILENCE_RELEASE_FRAMES) {
                    lastStableHzRef.current = null;
                    octaveCandidateRef.current = null;
                }
            }
            const elapsedSeconds = (performance.now() - recordingStartMsRef.current) / 1000;
            setFrequencySeries((prev) => [...prev, { t: elapsedSeconds, hz: displayHz, amp: displayHz ? loudness : null, tone: displayHz ? breathiness : null }].slice(-MAX_FREQUENCY_POINTS));
        }, 45);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [isRecording, tonicHz]);
    useEffect(() => {
        return () => {
            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
            }
            void analysisAudioContextRef.current?.close();
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
                mediaRecorderRef.current.stop();
            }
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, [recordedAudioUrl]);
    // Moves the recording progress indicator backward.
    const handleBack = () => {
        setRecordingProgress((prev) => Math.max(0, prev - 8));
    };
    // Moves the recording progress indicator forward.
    const handleForward = () => {
        setRecordingProgress((prev) => Math.min(100, prev + 8));
    };
    // Jumps the progress indicator to the beginning.
    const handleJumpToStart = () => {
        setRecordingProgress(0);
    };
    // Jumps the progress indicator to the end.
    const handleJumpToEnd = () => {
        setRecordingProgress(100);
    };
    // Starts microphone capture and initializes analysis/recording state.
    const startRecording = async () => {
        if (!recorderSupported || isRecording) {
            return;
        }
        if (audioPlaybackRef.current) {
            audioPlaybackRef.current.pause();
            audioPlaybackRef.current.currentTime = 0;
            setIsPlayingBack(false);
        }
        if (recordedAudioUrl) {
            URL.revokeObjectURL(recordedAudioUrl);
            setRecordedAudioUrl(null);
        }
        recordingStartMsRef.current = performance.now();
        pitchHistoryRef.current = [];
        lastStableHzRef.current = null;
        silenceFramesRef.current = 0;
        octaveCandidateRef.current = null;
        setFrequencySeries([]);
        if (chartWrapRef.current) {
            chartWrapRef.current.scrollLeft = 0;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const analysisContext = new window.AudioContext();
            const source = analysisContext.createMediaStreamSource(stream);
            const analyser = analysisContext.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.2;
            source.connect(analyser);
            audioChunksRef.current = [];
            mediaStreamRef.current = stream;
            mediaRecorderRef.current = recorder;
            analysisAudioContextRef.current = analysisContext;
            analyserRef.current = analyser;
            analyserDataRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
            analyserFreqDataRef.current = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * Float32Array.BYTES_PER_ELEMENT));
            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };
            recorder.onstop = () => {
                const mimeType = recorder.mimeType || "audio/webm";
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                const objectUrl = URL.createObjectURL(blob);
                setRecordedAudioUrl(objectUrl);
                stream.getTracks().forEach((track) => track.stop());
                void analysisContext.close();
                analysisAudioContextRef.current = null;
                analyserRef.current = null;
                analyserDataRef.current = null;
                analyserFreqDataRef.current = null;
                mediaStreamRef.current = null;
            };
            setRecordingProgress(0);
            recorder.start();
            setIsRecording(true);
        }
        catch {
            setIsRecording(false);
        }
    };
    // Stops microphone recording and finalizes the captured clip.
    const stopRecording = () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) {
            setIsRecording(false);
            return;
        }
        if (recorder.state !== "inactive") {
            recorder.stop();
        }
        setIsRecording(false);
    };
    // Toggles between starting and stopping recording for this card.
    const handleRecordToggle = () => {
        if (isRecording) {
            stopRecording();
            return;
        }
        if (canRecord) {
            onDismissSetupOverlay();
        }
        void startRecording();
    };
    // Toggles playback of the last recorded clip.
    const handlePlaybackToggle = async () => {
        if (!audioPlaybackRef.current || !recordedAudioUrl) {
            return;
        }
        if (isPlayingBack) {
            audioPlaybackRef.current.pause();
            setIsPlayingBack(false);
            return;
        }
        await audioPlaybackRef.current.play();
        setIsPlayingBack(true);
    };
    // Applies BPM edits from the graph-level BPM input.
    const handleBpmInput = (event) => {
        const parsed = Number(event.target.value);
        if (Number.isNaN(parsed)) {
            return;
        }
        onBpmChange(parsed);
    };
    const latestTimeSeconds = frequencySeries.length ? frequencySeries[frequencySeries.length - 1].t : 0;
    const maxTimeSeconds = Math.max(MIN_SCROLLABLE_TIME_SECONDS, Math.ceil(latestTimeSeconds / TIME_TICK_SECONDS) * TIME_TICK_SECONDS);
    const plotRightX = Math.max(MIN_PLOT_RIGHT_X, PLOT_LEFT_X + maxTimeSeconds * X_UNITS_PER_SECOND);
    const svgWidthUnits = plotRightX + 2;
    const timeTicks = Array.from({ length: Math.floor(maxTimeSeconds / TIME_TICK_SECONDS) + 1 }, (_, i) => i * TIME_TICK_SECONDS);
    const phrasingSeries = useMemo(() => buildPhrasingSeries(frequencySeries), [frequencySeries]);
    const frequencyPath = useMemo(() => (showFrequencyDiagram ? buildTracePath(frequencySeries, tonicHz) : ""), [showFrequencyDiagram, frequencySeries, tonicHz]);
    const phrasingPath = useMemo(() => (showPhrasing ? buildTracePath(phrasingSeries, tonicHz) : ""), [showPhrasing, phrasingSeries, tonicHz]);
    const noteHitPoints = useMemo(() => (showNotes ? buildNoteHitPoints(frequencySeries, tonicHz, swaraGuides.map((guide) => guide.offset)) : []), [showNotes, frequencySeries, tonicHz, swaraGuides]);
    const dynamicsLines = useMemo(() => (showDynamics ? buildDynamicsLines(frequencySeries, tonicHz) : []), [showDynamics, frequencySeries, tonicHz]);
    const toneHazePoints = useMemo(() => (showTone ? buildToneHazePoints(frequencySeries, tonicHz) : []), [showTone, frequencySeries, tonicHz]);
    const toneLayerStrength = useMemo(() => {
        if (!showTone || frequencySeries.length === 0) {
            return 0;
        }
        let toneSum = 0;
        let toneCount = 0;
        for (const point of frequencySeries) {
            if (point.hz === null || point.hz <= 0) {
                continue;
            }
            const tone = point.tone ?? 0;
            if (!Number.isFinite(tone) || tone <= 0) {
                continue;
            }
            toneSum += tone;
            toneCount += 1;
        }
        if (toneCount === 0) {
            return 0;
        }
        return Math.max(0, Math.min(1, toneSum / toneCount));
    }, [showTone, frequencySeries]);
    const swaraGuideLines = swaraGuides.map((guide) => {
        const yNormalized = (guide.offset - SWARA_MIN_OFFSET) / (SWARA_MAX_OFFSET - SWARA_MIN_OFFSET);
        const y = (PLOT_BOTTOM_Y - yNormalized * (PLOT_BOTTOM_Y - PLOT_TOP_Y)) * Y_UNITS_TO_PX;
        return { offset: guide.offset, y, label: guide.label, color: guide.color };
    });
    // Syncs sticky axis labels with the chart scroll position.
    const handleChartScroll = useCallback((event) => {
        const target = event.currentTarget;
        setChartScrollState({
            left: target.scrollLeft,
            top: target.scrollTop,
            width: target.clientWidth,
            height: target.clientHeight
        });
    }, []);
    const visibleSwaraLabels = swaraGuideLines
        .map((guide) => ({
        key: guide.offset,
        label: guide.label,
        y: CHART_PADDING_TOP_PX + guide.y - chartScrollState.top,
        color: guide.color
    }))
        .filter((guide) => guide.y >= CHART_PADDING_TOP_PX - 12 &&
        guide.y <= chartScrollState.height - CHART_PADDING_BOTTOM_PX + 12);
    const visibleTimeLabels = timeTicks
        .map((tick) => ({
        key: tick,
        label: `${tick}s`,
        x: CHART_PADDING_X_PX + PLOT_LEFT_X + tick * X_UNITS_PER_SECOND - chartScrollState.left
    }))
        .filter((tick) => tick.x >= CHART_PADDING_X_PX - 36 &&
        tick.x <= chartScrollState.width - CHART_PADDING_X_PX + 36);
    useEffect(() => {
        if (hasSetInitialVerticalFocusRef.current || !chartWrapRef.current || !chartRef.current) {
            return;
        }
        const wrap = chartWrapRef.current;
        const chart = chartRef.current;
        const chartHeight = chart.getBoundingClientRect().height;
        if (!chartHeight || wrap.scrollHeight <= wrap.clientHeight) {
            return;
        }
        const offsetRange = SWARA_MAX_OFFSET - SWARA_MIN_OFFSET;
        const offsetToPixelY = (offset) => {
            const normalized = (offset - SWARA_MIN_OFFSET) / offsetRange;
            const yUnit = PLOT_BOTTOM_Y - normalized * (PLOT_BOTTOM_Y - PLOT_TOP_Y);
            return (yUnit / 100) * chartHeight;
        };
        const yHighS = offsetToPixelY(DEFAULT_FOCUS_HIGH_S_OFFSET);
        const yLowS = offsetToPixelY(DEFAULT_FOCUS_LOW_S_OFFSET);
        const focusCenter = (Math.min(yHighS, yLowS) + Math.max(yHighS, yLowS)) / 2;
        const nextScrollTop = focusCenter - wrap.clientHeight / 2;
        const maxScrollTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
        wrap.scrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop));
        hasSetInitialVerticalFocusRef.current = true;
    }, []);
    useEffect(() => {
        const wrap = chartWrapRef.current;
        if (!wrap) {
            return;
        }
        const sync = () => {
            setChartScrollState({
                left: wrap.scrollLeft,
                top: wrap.scrollTop,
                width: wrap.clientWidth,
                height: wrap.clientHeight
            });
        };
        sync();
        window.addEventListener("resize", sync);
        return () => {
            window.removeEventListener("resize", sync);
        };
    }, []);
    useEffect(() => {
        if (!isRecording) {
            return;
        }
        const wrap = chartWrapRef.current;
        if (!wrap) {
            return;
        }
        const currentTraceX = CHART_PADDING_X_PX + PLOT_LEFT_X + latestTimeSeconds * X_UNITS_PER_SECOND;
        const followOffsetPx = Math.max(90, wrap.clientWidth * 0.45);
        const targetScrollLeft = Math.max(0, currentTraceX - followOffsetPx);
        const maxScrollLeft = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
        const clampedTarget = Math.min(targetScrollLeft, maxScrollLeft);
        if (Math.abs(wrap.scrollLeft - clampedTarget) > 1) {
            wrap.scrollLeft = clampedTarget;
        }
    }, [isRecording, latestTimeSeconds, plotRightX]);
    return (_jsxs("section", { className: `graph-card ${className ?? ""}`, children: [_jsxs("header", { className: "graph-card-header", children: [_jsx("div", { className: "logo-wrap", children: logo === "teacher" ? _jsx(TeacherLogo, {}) : _jsx(StudentLogo, {}) }), _jsxs("div", { className: "recording-bar", role: "group", "aria-label": `${label} recording controls`, children: [_jsx("button", { type: "button", className: "control-button", "aria-label": `Jump to beginning ${label}`, onClick: handleJumpToStart, children: _jsx("span", { className: "icon icon-start" }) }), _jsx("button", { type: "button", className: "control-button", "aria-label": `Back ${label}`, onClick: handleBack, children: _jsx("span", { className: "icon icon-back" }) }), _jsx("button", { type: "button", className: `control-button control-record${isRecording ? " active" : ""}`, "aria-label": `Record ${label}`, onClick: handleRecordToggle, disabled: !recorderSupported || !canRecord, children: _jsx("span", { className: "icon icon-record" }) }), _jsx("button", { type: "button", className: "control-button", "aria-label": `Forward ${label}`, onClick: handleForward, children: _jsx("span", { className: "icon icon-forward" }) }), _jsx("button", { type: "button", className: "control-button", "aria-label": `Jump to end ${label}`, onClick: handleJumpToEnd, children: _jsx("span", { className: "icon icon-end" }) }), _jsxs("label", { className: "bpm-control", children: [_jsx("span", { children: "BPM" }), _jsx("input", { type: "number", min: 20, max: 240, value: bpm, onChange: handleBpmInput })] }), _jsx("button", { type: "button", className: "utility-button utility-button-wide", onClick: () => onOpenPopup("shruti"), children: shrutiButtonLabel }), _jsx("button", { type: "button", className: "utility-button utility-button-wide", onClick: () => onOpenPopup("talam"), children: talamButtonLabel }), _jsx("button", { type: "button", className: "utility-button utility-button-wide", onClick: () => onOpenPopup("ragam"), children: ragamButtonLabel }), _jsx("button", { type: "button", className: "control-button upload-button", "aria-label": `Upload for ${label}`, children: _jsx("span", { className: "icon icon-upload" }) }), recordedAudioUrl && (_jsx("button", { type: "button", className: "control-button playback-button", onClick: handlePlaybackToggle, children: _jsx("span", { className: `icon ${isPlayingBack ? "icon-pause" : "icon-play"}` }) }))] }), _jsx("div", { className: "header-spacer", "aria-hidden": "true" })] }), _jsxs("div", { className: "chart-shell", children: [_jsx("div", { ref: chartWrapRef, className: "chart-wrap", onScroll: handleChartScroll, children: _jsxs("svg", { ref: chartRef, className: "chart", viewBox: `0 0 ${svgWidthUnits} ${CHART_SCROLL_HEIGHT_PX}`, preserveAspectRatio: "xMinYMin", style: { width: `${svgWidthUnits}px`, height: `${CHART_SCROLL_HEIGHT_PX}px` }, role: "img", "aria-label": `${label} frequency by time graph`, children: [_jsx("rect", { x: "0", y: "0", width: svgWidthUnits, height: CHART_SCROLL_HEIGHT_PX, fill: "none" }), _jsx("line", { x1: PLOT_LEFT_X, y1: PLOT_TOP_Y * Y_UNITS_TO_PX, x2: PLOT_LEFT_X, y2: PLOT_BOTTOM_Y * Y_UNITS_TO_PX, className: "axis-line" }), _jsx("line", { x1: PLOT_LEFT_X, y1: PLOT_BOTTOM_Y * Y_UNITS_TO_PX, x2: plotRightX, y2: PLOT_BOTTOM_Y * Y_UNITS_TO_PX, className: "axis-line" }), swaraGuideLines.map((guide) => {
                                    return (_jsx("g", { children: _jsx("line", { x1: PLOT_LEFT_X, y1: guide.y, x2: plotRightX, y2: guide.y, className: "swara-grid-line", style: { stroke: guide.color } }) }, `swara-${guide.offset}`));
                                }), showTone &&
                                    toneHazePoints.map((point) => (_jsx("circle", { cx: point.x, cy: point.y, r: point.radius, className: "tone-haze-dot", style: { opacity: point.opacity } }, point.key))), showTone && frequencyPath && (_jsx("path", { d: frequencyPath, className: "tone-trace-haze", style: { opacity: 0.24 + toneLayerStrength * 0.52 } })), showFrequencyDiagram && frequencyPath && _jsx("path", { d: frequencyPath, className: "frequency-trace" }), showPhrasing && phrasingPath && _jsx("path", { d: phrasingPath, className: "phrasing-trace" }), showNotes &&
                                    noteHitPoints.map((point) => (_jsx("circle", { cx: point.x, cy: point.y, r: 3.8, className: "notes-dot" }, point.key))), showDynamics &&
                                    dynamicsLines.map((line) => (_jsx("line", { x1: line.x, y1: line.yTop, x2: line.x, y2: line.yBottom, className: "dynamics-line", style: { opacity: line.opacity, strokeWidth: line.strokeWidth } }, line.key)))] }) }), _jsxs("div", { className: "axis-overlay", "aria-hidden": "true", children: [visibleSwaraLabels.map((guide) => (_jsx("span", { className: "sticky-axis-label sticky-axis-y", style: { top: `${guide.y}px`, color: guide.color }, children: guide.label }, `sticky-swara-${guide.key}`))), visibleTimeLabels.map((tick) => (_jsx("span", { className: "sticky-axis-label sticky-axis-x", style: { left: `${tick.x}px` }, children: tick.label }, `sticky-time-${tick.key}`)))] }), (!setupOverlayDismissed && !isRecording && (!hasShrutiSet || !hasRagamSet || !hasTalamSet)) && (_jsx("div", { className: "chart-setup-overlay", role: "group", "aria-label": "Recording setup required", children: _jsxs("div", { className: "chart-setup-card", children: [_jsxs("div", { className: "chart-setup-row", children: [_jsx("span", { className: "chart-setup-label", children: "Shruthi" }), _jsx("button", { type: "button", className: `chart-setup-select${hasShrutiSet ? " is-set" : ""}`, onClick: () => onOpenPopup("shruti"), children: hasShrutiSet ? shrutiButtonLabel.replace("Shruthi: ", "") : "Select" })] }), _jsxs("div", { className: "chart-setup-row", children: [_jsx("span", { className: "chart-setup-label", children: "Ragam" }), _jsx("button", { type: "button", className: `chart-setup-select${hasRagamSet ? " is-set" : ""}`, onClick: () => onOpenPopup("ragam"), children: hasRagamSet ? ragamButtonLabel.replace("Ragam: ", "") : "Select" })] }), _jsxs("div", { className: "chart-setup-row", children: [_jsx("span", { className: "chart-setup-label", children: "Talam" }), _jsx("button", { type: "button", className: `chart-setup-select${hasTalamSet ? " is-set" : ""}`, onClick: () => onOpenPopup("talam"), children: hasTalamSet ? talamButtonLabel.replace("Talam: ", "") : "Select" })] }), _jsx("p", { className: "chart-setup-hint", children: canRecord ? "Shruthi and Ragam are set. Talam is optional." : "Set Shruthi and Ragam to enable recording." }), canRecord && (_jsx("div", { className: "chart-setup-actions", children: _jsx("button", { type: "button", className: "chart-setup-go", onClick: onDismissSetupOverlay, "aria-label": "Continue to recording", children: "\u2192" }) }))] }) }))] }), recordedAudioUrl && (_jsx("audio", { ref: audioPlaybackRef, src: recordedAudioUrl, onEnded: () => setIsPlayingBack(false), onPause: () => setIsPlayingBack(false), hidden: true }))] }));
}
// Main page container that wires popups, shared settings, and both graph cards.
export default function CarnaticWorkbenchPage() {
    const shellRef = useRef(null);
    const targetRef = useRef({ x: 0, y: 0 });
    const currentRef = useRef({ x: 0, y: 0 });
    const rafRef = useRef(null);
    const talamAudioContextRef = useRef(null);
    const talamLoopRef = useRef(null);
    const talamStepRef = useRef(0);
    const shrutiAudioContextRef = useRef(null);
    const shrutiPreviewSourcesRef = useRef([]);
    const [pageView, setPageView] = useState("comparison");
    const [bpm, setBpm] = useState(96);
    const [activePopup, setActivePopup] = useState(null);
    const [shrutiLabel, setShrutiLabel] = useState(SHRUTI_OPTIONS[0]?.label ?? "C3");
    const [shrutiHz, setShrutiHz] = useState(SHRUTI_OPTIONS[0]?.hz ?? 130.8128);
    const [pendingShrutiLabel, setPendingShrutiLabel] = useState(SHRUTI_OPTIONS[0]?.label ?? "C3");
    const [pendingShrutiHz, setPendingShrutiHz] = useState(SHRUTI_OPTIONS[0]?.hz ?? 130.8128);
    const [hasShrutiSet, setHasShrutiSet] = useState(false);
    const [ragamName, setRagamName] = useState("");
    const [ragamSelectedNotes, setRagamSelectedNotes] = useState(DEFAULT_RAGAM_NOTES);
    const [pendingRagamName, setPendingRagamName] = useState("");
    const [pendingRagamNotes, setPendingRagamNotes] = useState(DEFAULT_RAGAM_NOTES);
    const [hasRagamSet, setHasRagamSet] = useState(false);
    const [talamName, setTalamName] = useState("");
    const [talamBpm, setTalamBpm] = useState(96);
    const [talamBeats, setTalamBeats] = useState(8);
    const [talamPattern, setTalamPattern] = useState(() => Array(8).fill(0));
    const [isTalamPlaying, setIsTalamPlaying] = useState(false);
    const [currentBeatIndex, setCurrentBeatIndex] = useState(null);
    const [hasTalamSet, setHasTalamSet] = useState(false);
    const [setupOverlayDismissed, setSetupOverlayDismissed] = useState(false);
    const [layersEnabled, setLayersEnabled] = useState({
        layer1: true,
        layer2: false,
        layer3: false,
        layer4: false,
        layer5: false
    });
    const [recordingByCard, setRecordingByCard] = useState({
        teacher: false,
        student: false
    });
    const isAnyRecording = recordingByCard.teacher || recordingByCard.student;
    const swaraGuides = buildSwaraGuides(ragamSelectedNotes);
    const canRecord = hasShrutiSet && hasRagamSet;
    const shrutiButtonLabel = hasShrutiSet ? `Shruthi: ${shrutiLabel}` : "Set Shruthi";
    const ragamButtonLabel = hasRagamSet ? `Ragam: ${ragamName.trim() || "Selected"}` : "Set Ragam";
    const talamButtonLabel = hasTalamSet ? `Talam: ${talamName.trim() || `${talamBeats} beats`}` : "Set Talam";
    // Hides setup overlay after required selections are complete.
    const handleDismissSetupOverlay = useCallback(() => {
        setSetupOverlayDismissed(true);
    }, []);
    useEffect(() => {
        if (!isAnyRecording) {
            return;
        }
        setLayersEnabled({
            layer1: true,
            layer2: false,
            layer3: false,
            layer4: false,
            layer5: false
        });
    }, [isAnyRecording]);
    useEffect(() => {
        if (!canRecord) {
            setSetupOverlayDismissed(false);
        }
    }, [canRecord]);
    useEffect(() => {
        const animate = () => {
            const shell = shellRef.current;
            if (shell) {
                const target = targetRef.current;
                const current = currentRef.current;
                current.x += (target.x - current.x) * 0.11;
                current.y += (target.y - current.y) * 0.11;
                shell.style.setProperty("--shift-x", `${current.x}px`);
                shell.style.setProperty("--shift-y", `${current.y}px`);
            }
            rafRef.current = window.requestAnimationFrame(animate);
        };
        rafRef.current = window.requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) {
                window.cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);
    useEffect(() => {
        setTalamPattern((prev) => {
            if (prev.length === talamBeats) {
                return prev;
            }
            const next = Array.from({ length: talamBeats }, (_, index) => prev[index] ?? 0);
            return next;
        });
    }, [talamBeats]);
    useEffect(() => {
        if (!isTalamPlaying) {
            if (talamLoopRef.current) {
                window.clearInterval(talamLoopRef.current);
                talamLoopRef.current = null;
            }
            setCurrentBeatIndex(null);
            return;
        }
        if (!talamAudioContextRef.current) {
            talamAudioContextRef.current = new window.AudioContext();
        }
        if (talamAudioContextRef.current.state === "suspended") {
            void talamAudioContextRef.current.resume();
        }
        // Plays one talam step based on the selected beat pattern.
        const playStep = (stepIndex) => {
            const level = talamPattern[stepIndex] ?? 0;
            setCurrentBeatIndex(stepIndex);
            if (level === 0 || !talamAudioContextRef.current) {
                return;
            }
            const audioContext = talamAudioContextRef.current;
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = level === 2 ? 900 : 560;
            gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.2);
        };
        talamStepRef.current = 0;
        playStep(talamStepRef.current);
        const beatDurationMs = Math.max(120, Math.round(60000 / Math.max(20, talamBpm)));
        talamLoopRef.current = window.setInterval(() => {
            talamStepRef.current = (talamStepRef.current + 1) % Math.max(1, talamBeats);
            playStep(talamStepRef.current);
        }, beatDurationMs);
        return () => {
            if (talamLoopRef.current) {
                window.clearInterval(talamLoopRef.current);
                talamLoopRef.current = null;
            }
        };
    }, [isTalamPlaying, talamBpm, talamBeats, talamPattern]);
    useEffect(() => {
        return () => {
            if (talamLoopRef.current) {
                window.clearInterval(talamLoopRef.current);
            }
            void talamAudioContextRef.current?.close();
            stopScheduledSources(shrutiPreviewSourcesRef.current);
            void shrutiAudioContextRef.current?.close();
        };
    }, []);
    // Updates background motion target from pointer position.
    const handlePointerMove = useCallback((event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const normalizedX = (event.clientX - rect.left) / rect.width - 0.5;
        const normalizedY = (event.clientY - rect.top) / rect.height - 0.5;
        const x = normalizedX * 96;
        const y = normalizedY * 74;
        targetRef.current = { x, y };
    }, []);
    // Recenters background motion when pointer leaves the page.
    const handlePointerLeave = useCallback(() => {
        targetRef.current = { x: 0, y: 0 };
    }, []);
    // Changes layout mode (comparison/focus/side-by-side).
    const handlePageViewChange = useCallback((event) => {
        setPageView(event.target.value);
    }, []);
    // Tracks teacher-card recording status at the page level.
    const handleTeacherRecordingState = useCallback((isRecording) => {
        setRecordingByCard((prev) => (prev.teacher === isRecording ? prev : { ...prev, teacher: isRecording }));
    }, []);
    // Tracks student-card recording status at the page level.
    const handleStudentRecordingState = useCallback((isRecording) => {
        setRecordingByCard((prev) => (prev.student === isRecording ? prev : { ...prev, student: isRecording }));
    }, []);
    // Toggles visual layers while preserving valid combinations.
    const handleLayerToggle = useCallback((layerKey) => {
        setLayersEnabled((prev) => {
            if (isAnyRecording && layerKey !== "layer1") {
                return prev;
            }
            if (layerKey === "layer1") {
                if (isAnyRecording) {
                    return prev;
                }
                const nextLayer1 = !prev.layer1;
                const anyOtherActive = prev.layer2 || prev.layer3 || prev.layer4 || prev.layer5;
                if (!nextLayer1 && !anyOtherActive) {
                    return prev;
                }
                return { ...prev, layer1: nextLayer1 };
            }
            const next = { ...prev, [layerKey]: !prev[layerKey] };
            if (!next.layer1 && !next.layer2 && !next.layer3 && !next.layer4 && !next.layer5) {
                next.layer1 = true;
            }
            return next;
        });
    }, [isAnyRecording]);
    // Normalizes and applies a shared BPM value.
    const handleBpmChange = useCallback((value) => {
        const bounded = Math.max(20, Math.min(240, Math.round(value)));
        setBpm(bounded);
    }, []);
    // Plays a single low-S tanpura-style shruti preview.
    const playShrutiPreview = useCallback((baseHz) => {
        if (baseHz <= 0 || !Number.isFinite(baseHz)) {
            return;
        }
        stopScheduledSources(shrutiPreviewSourcesRef.current);
        if (!shrutiAudioContextRef.current) {
            shrutiAudioContextRef.current = new window.AudioContext();
        }
        const audioContext = shrutiAudioContextRef.current;
        if (audioContext.state === "suspended") {
            void audioContext.resume();
        }
        const strokeStart = audioContext.currentTime + 0.04;
        scheduleTanpuraStroke(audioContext, baseHz, strokeStart, shrutiPreviewSourcesRef.current);
    }, []);
    // Closes whichever configuration popup is currently open.
    const handleClosePopup = useCallback(() => {
        setActivePopup(null);
        setIsTalamPlaying(false);
    }, []);
    // Opens a popup and seeds it with the current saved values.
    const handleOpenPopup = useCallback((kind) => {
        if (kind === "shruti") {
            setPendingShrutiHz(shrutiHz);
            setPendingShrutiLabel(shrutiLabel);
        }
        if (kind === "ragam") {
            setPendingRagamName(ragamName);
            setPendingRagamNotes(ragamSelectedNotes);
        }
        setActivePopup(kind);
    }, [ragamName, ragamSelectedNotes, shrutiHz, shrutiLabel]);
    // Updates talam beat-count input in the popup.
    const handleTalamBeatChange = useCallback((event) => {
        const parsed = Number(event.target.value);
        if (Number.isNaN(parsed)) {
            return;
        }
        const bounded = Math.max(1, Math.min(44, Math.floor(parsed)));
        setTalamBeats(bounded);
    }, []);
    // Cycles beat state for one talam step (silent/low/high).
    const toggleTalamBeatState = useCallback((index) => {
        setTalamPattern((prev) => prev.map((value, i) => {
            if (i !== index) {
                return value;
            }
            if (value === 0) {
                return 2;
            }
            if (value === 2) {
                return 1;
            }
            return 0;
        }));
    }, []);
    // Updates talam BPM input in the popup.
    const handleTalamBpmChange = useCallback((event) => {
        const parsed = Number(event.target.value);
        if (Number.isNaN(parsed)) {
            return;
        }
        const bounded = Math.max(20, Math.min(240, Math.round(parsed)));
        setTalamBpm(bounded);
    }, []);
    // Saves talam settings and applies BPM to the main controls.
    const handleSetTalam = useCallback(() => {
        setBpm(talamBpm);
        setHasTalamSet(true);
        handleClosePopup();
    }, [handleClosePopup, talamBpm]);
    // Saves selected shruti as the current tonic.
    const handleSetShruti = useCallback(() => {
        setShrutiHz(pendingShrutiHz);
        setShrutiLabel(pendingShrutiLabel);
        setHasShrutiSet(true);
        handleClosePopup();
    }, [handleClosePopup, pendingShrutiHz, pendingShrutiLabel]);
    // Updates ragam name and autocompletes notes when a known ragam is selected.
    const handlePendingRagamNameChange = useCallback((event) => {
        const nextName = event.target.value;
        setPendingRagamName(nextName);
        const matchedPreset = findRagamPresetByName(nextName);
        if (!matchedPreset) {
            return;
        }
        setPendingRagamName(matchedPreset.name);
        setPendingRagamNotes(normalizeRagamNotes(matchedPreset.notes));
    }, []);
    // Toggles ragam-note selection while enforcing invalid-combo rules.
    const togglePendingRagamNote = useCallback((noteId) => {
        setPendingRagamNotes((prev) => {
            if (prev.includes(noteId)) {
                if (prev.length === 1) {
                    return prev;
                }
                return prev.filter((item) => item !== noteId);
            }
            const nextSet = new Set([...prev, noteId]);
            for (const [a, b] of INCOMPATIBLE_RAGAM_NOTE_PAIRS) {
                if (noteId === a && nextSet.has(b)) {
                    nextSet.delete(b);
                }
                if (noteId === b && nextSet.has(a)) {
                    nextSet.delete(a);
                }
            }
            return normalizeRagamNotes(Array.from(nextSet));
        });
    }, []);
    // Saves the configured ragam name and note selection.
    const handleSetRagam = useCallback(() => {
        setRagamSelectedNotes(pendingRagamNotes);
        setRagamName(pendingRagamName.trim());
        setHasRagamSet(true);
        handleClosePopup();
    }, [handleClosePopup, pendingRagamName, pendingRagamNotes]);
    return (_jsxs("main", { ref: shellRef, className: "page-shell", onPointerMove: handlePointerMove, onPointerLeave: handlePointerLeave, children: [_jsx("div", { className: "syn-layer syn-a", "aria-hidden": "true" }), _jsx("div", { className: "syn-layer syn-b", "aria-hidden": "true" }), _jsx("div", { className: "syn-layer syn-c", "aria-hidden": "true" }), _jsx("div", { className: "syn-layer syn-d", "aria-hidden": "true" }), _jsx("div", { className: "syn-layer syn-e", "aria-hidden": "true" }), _jsx("div", { className: "content", children: _jsxs("div", { className: "layout-shell", children: [_jsxs("div", { className: "page-main", children: [_jsx("div", { className: "page-top", children: _jsx("h1", { children: "Soundscape Monitor" }) }), _jsxs("div", { className: `graphs view-${pageView}`, children: [pageView === "teacher-focus" && (_jsx(GraphCard, { logo: "teacher", className: "focus-card", bpm: bpm, tonicHz: shrutiHz, tonicLabel: shrutiLabel, swaraGuides: swaraGuides, showFrequencyDiagram: layersEnabled.layer1, showPhrasing: layersEnabled.layer2, showNotes: layersEnabled.layer3, showDynamics: layersEnabled.layer4, showTone: layersEnabled.layer5, canRecord: canRecord, hasShrutiSet: hasShrutiSet, hasRagamSet: hasRagamSet, hasTalamSet: hasTalamSet, shrutiButtonLabel: shrutiButtonLabel, talamButtonLabel: talamButtonLabel, ragamButtonLabel: ragamButtonLabel, setupOverlayDismissed: setupOverlayDismissed, onBpmChange: handleBpmChange, onOpenPopup: handleOpenPopup, onDismissSetupOverlay: handleDismissSetupOverlay, onRecordingStateChange: handleTeacherRecordingState })), pageView === "student-focus" && (_jsx(GraphCard, { logo: "student", className: "focus-card", bpm: bpm, tonicHz: shrutiHz, tonicLabel: shrutiLabel, swaraGuides: swaraGuides, showFrequencyDiagram: layersEnabled.layer1, showPhrasing: layersEnabled.layer2, showNotes: layersEnabled.layer3, showDynamics: layersEnabled.layer4, showTone: layersEnabled.layer5, canRecord: canRecord, hasShrutiSet: hasShrutiSet, hasRagamSet: hasRagamSet, hasTalamSet: hasTalamSet, shrutiButtonLabel: shrutiButtonLabel, talamButtonLabel: talamButtonLabel, ragamButtonLabel: ragamButtonLabel, setupOverlayDismissed: setupOverlayDismissed, onBpmChange: handleBpmChange, onOpenPopup: handleOpenPopup, onDismissSetupOverlay: handleDismissSetupOverlay, onRecordingStateChange: handleStudentRecordingState })), (pageView === "comparison" || pageView === "side-by-side") && (_jsxs(_Fragment, { children: [_jsx(GraphCard, { logo: "teacher", bpm: bpm, tonicHz: shrutiHz, tonicLabel: shrutiLabel, swaraGuides: swaraGuides, showFrequencyDiagram: layersEnabled.layer1, showPhrasing: layersEnabled.layer2, showNotes: layersEnabled.layer3, showDynamics: layersEnabled.layer4, showTone: layersEnabled.layer5, canRecord: canRecord, hasShrutiSet: hasShrutiSet, hasRagamSet: hasRagamSet, hasTalamSet: hasTalamSet, shrutiButtonLabel: shrutiButtonLabel, talamButtonLabel: talamButtonLabel, ragamButtonLabel: ragamButtonLabel, setupOverlayDismissed: setupOverlayDismissed, onBpmChange: handleBpmChange, onOpenPopup: handleOpenPopup, onDismissSetupOverlay: handleDismissSetupOverlay, onRecordingStateChange: handleTeacherRecordingState }), _jsx(GraphCard, { logo: "student", bpm: bpm, tonicHz: shrutiHz, tonicLabel: shrutiLabel, swaraGuides: swaraGuides, showFrequencyDiagram: layersEnabled.layer1, showPhrasing: layersEnabled.layer2, showNotes: layersEnabled.layer3, showDynamics: layersEnabled.layer4, showTone: layersEnabled.layer5, canRecord: canRecord, hasShrutiSet: hasShrutiSet, hasRagamSet: hasRagamSet, hasTalamSet: hasTalamSet, shrutiButtonLabel: shrutiButtonLabel, talamButtonLabel: talamButtonLabel, ragamButtonLabel: ragamButtonLabel, setupOverlayDismissed: setupOverlayDismissed, onBpmChange: handleBpmChange, onOpenPopup: handleOpenPopup, onDismissSetupOverlay: handleDismissSetupOverlay, onRecordingStateChange: handleStudentRecordingState })] }))] })] }), _jsxs("aside", { className: "controls-sidebar", "aria-label": "Page controls", children: [_jsxs("div", { className: "controls-group", children: [_jsx("label", { htmlFor: "page-view-select", className: "settings-group-title", children: "Page view" }), _jsx("select", { id: "page-view-select", className: "page-view-select", value: pageView, onChange: handlePageViewChange, children: pageViewOptions.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }), _jsx("div", { className: "settings-toggles", children: layerOptions.map((layer) => (_jsxs("button", { type: "button", className: "settings-toggle", role: "switch", "aria-checked": layersEnabled[layer.key], disabled: isAnyRecording && layer.key !== "layer1", onClick: () => handleLayerToggle(layer.key), children: [_jsx("span", { children: layer.label }), _jsx("span", { className: `toggle-ui${layersEnabled[layer.key] ? " on" : ""}`, "aria-hidden": "true", children: _jsx("span", { className: "toggle-thumb" }) })] }, layer.key))) })] })] }) }), activePopup && (_jsx("div", { className: "control-modal-backdrop", onClick: handleClosePopup, role: "presentation", children: _jsx("div", { className: "control-modal", role: "dialog", "aria-label": activePopup === "talam" ? "Talam popup" : activePopup === "shruti" ? "Shruti popup" : "Ragam popup", onClick: (event) => event.stopPropagation(), children: activePopup === "talam" ? (_jsxs("div", { className: "talam-popup", children: [_jsx("h2", { children: "Set Talam" }), _jsxs("label", { className: "talam-input-row talam-name-row", children: [_jsx("span", { children: "Talam name" }), _jsx("input", { type: "text", value: talamName, maxLength: 48, onChange: (event) => setTalamName(event.target.value), placeholder: "Enter name" })] }), _jsxs("label", { className: "talam-input-row", children: [_jsx("span", { children: "BPM" }), _jsx("input", { type: "number", min: 20, max: 240, value: talamBpm, onChange: handleTalamBpmChange })] }), _jsxs("label", { className: "talam-input-row", children: [_jsx("span", { children: "Beats per cycle" }), _jsx("input", { type: "number", min: 1, max: 44, value: talamBeats, onChange: handleTalamBeatChange })] }), _jsx("div", { className: "talam-grid", role: "group", "aria-label": "Talam beat pattern", children: Array.from({ length: talamBeats }, (_, index) => (_jsx("button", { type: "button", className: `talam-box${talamPattern[index] === 2 ? " high" : ""}${talamPattern[index] === 1 ? " low" : ""}${currentBeatIndex === index ? " active" : ""}`, onClick: () => toggleTalamBeatState(index), "aria-label": `Beat ${index + 1}` }, `beat-${index}`))) }), _jsx("div", { className: "talam-actions", children: _jsx("button", { type: "button", className: "talam-play", onClick: () => setIsTalamPlaying((prev) => !prev), children: isTalamPlaying ? "Stop" : "Play" }) }), _jsx("div", { className: "talam-actions", children: _jsx("button", { type: "button", className: "talam-set", onClick: handleSetTalam, children: "Set" }) })] })) : (_jsx(_Fragment, { children: activePopup === "shruti" ? (_jsxs("div", { className: "shruti-popup", children: [_jsx("h2", { children: "Set Shruti" }), _jsxs("div", { className: "shruti-controls", children: [_jsxs("label", { children: ["Tonic (S)", _jsxs("div", { className: "shruti-picker-row", children: [_jsx("select", { value: pendingShrutiLabel, onChange: (event) => {
                                                                const selected = SHRUTI_OPTIONS.find((item) => item.label === event.target.value);
                                                                if (!selected) {
                                                                    return;
                                                                }
                                                                setPendingShrutiLabel(selected.label);
                                                                setPendingShrutiHz(selected.hz);
                                                                playShrutiPreview(selected.hz);
                                                            }, children: SHRUTI_OPTIONS.map((option) => (_jsx("option", { value: option.label, children: option.label }, option.label))) }), _jsx("button", { type: "button", className: "shruti-play-button", onClick: () => playShrutiPreview(pendingShrutiHz), "aria-label": "Play shruti preview", children: "\u25B6" })] })] }), _jsxs("div", { className: "shruti-preview", children: [pendingShrutiLabel, " = ", pendingShrutiHz.toFixed(2), " Hz"] }), _jsx("button", { type: "button", className: "talam-set", onClick: handleSetShruti, children: "Set" })] })] })) : (_jsxs("div", { className: "ragam-popup", children: [_jsx("h2", { children: "Set Ragam" }), _jsxs("label", { className: "talam-input-row talam-name-row", children: [_jsx("span", { children: "Ragam name" }), _jsx("input", { type: "text", value: pendingRagamName, maxLength: 48, onChange: handlePendingRagamNameChange, list: "ragam-name-options", placeholder: "Enter name" })] }), _jsx("datalist", { id: "ragam-name-options", children: RAGAM_PRESETS.map((preset) => (_jsx("option", { value: preset.name }, preset.key))) }), _jsx("div", { className: "ragam-grid", role: "group", "aria-label": "Ragam note selection", children: RAGAM_NOTE_OPTIONS.map((note) => {
                                        const selected = pendingRagamNotes.includes(note.id);
                                        return (_jsx("button", { type: "button", className: `ragam-note${selected ? " on" : ""}`, onClick: () => togglePendingRagamNote(note.id), style: { borderColor: note.color }, "aria-pressed": selected, children: note.id }, note.id));
                                    }) }), _jsxs("div", { className: "ragam-preview", children: [_jsx("span", { children: "Name:" }), _jsx("strong", { children: pendingRagamName.trim() || ragamName || "Untitled" })] }), _jsx("div", { className: "talam-actions", children: _jsx("button", { type: "button", className: "talam-set", onClick: handleSetRagam, children: "Set" }) })] })) })) }) }))] }));
}
