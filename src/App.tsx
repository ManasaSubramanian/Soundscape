import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent, type UIEvent } from "react";

type GraphCardProps = {
  logo: "teacher" | "student";
  className?: string;
  bpm: number;
  tonicHz: number;
  tonicLabel: string;
  swaraGuides: Array<{ offset: number; label: string; color: string }>;
  showFrequencyDiagram: boolean;
  showPhrasing: boolean;
  canRecord: boolean;
  hasShrutiSet: boolean;
  hasRagamSet: boolean;
  hasTalamSet: boolean;
  shrutiButtonLabel: string;
  talamButtonLabel: string;
  ragamButtonLabel: string;
  onBpmChange: (value: number) => void;
  onOpenPopup: (kind: "talam" | "ragam" | "shruti") => void;
  onRecordingStateChange: (isRecording: boolean) => void;
};

type PageView = "comparison" | "student-focus" | "teacher-focus" | "side-by-side";
type LayerKey = "layer1" | "layer2" | "layer3" | "layer4" | "layer5";
type FrequencyPoint = { t: number; hz: number | null };

const pageViewOptions: Array<{ value: PageView; label: string }> = [
  { value: "comparison", label: "Comparison" },
  { value: "student-focus", label: "Student focus" },
  { value: "teacher-focus", label: "Teacher focus" },
  { value: "side-by-side", label: "Side by side" }
];

const layerOptions: Array<{ key: LayerKey; label: string }> = [
  { key: "layer1", label: "Frequency diagram" },
  { key: "layer2", label: "Phrasing" },
  { key: "layer3", label: "Layer 3" },
  { key: "layer4", label: "Layer 4" },
  { key: "layer5", label: "Layer 5" }
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
] as const;

type RagamNoteId = (typeof RAGAM_NOTE_OPTIONS)[number]["id"];

const INCOMPATIBLE_RAGAM_NOTE_PAIRS: Array<[RagamNoteId, RagamNoteId]> = [
  ["R2", "G1"],
  ["R3", "G2"],
  ["R3", "G1"],
  ["D2", "N1"],
  ["D3", "N2"],
  ["D3", "N1"]
];

const DEFAULT_RAGAM_NOTES: RagamNoteId[] = ["S"];

const SHRUTI_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const SHRUTI_MIN_MIDI = 36; // C2
const SHRUTI_MAX_MIDI = 54; // F#3

const SHRUTI_OPTIONS: Array<{ label: string; hz: number }> = Array.from(
  { length: SHRUTI_MAX_MIDI - SHRUTI_MIN_MIDI + 1 },
  (_, index) => {
    const midiNumber = SHRUTI_MIN_MIDI + index;
    const semitoneFromC = ((midiNumber % 12) + 12) % 12;
    const octave = Math.floor(midiNumber / 12) - 1;
    const hz = 440 * 2 ** ((midiNumber - 69) / 12);
    return { label: `${SHRUTI_NOTE_NAMES[semitoneFromC]}${octave}`, hz: Number(hz.toFixed(4)) };
  }
);

const PITCH_MEDIAN_WINDOW = 5;
const PITCH_STICKY_CENTS = 16;
const PITCH_OCTAVE_RATIO_TOLERANCE = 0.28;
const PITCH_OCTAVE_ACCEPT_FRAMES = 3;
const PITCH_OCTAVE_SWITCH_MIN_SILENCE_FRAMES = 10;
const PITCH_LARGE_JUMP_CENTS = 620;
const PITCH_JUMP_ALIGNMENT_MIN_IMPROVEMENT_CENTS = 180;
const PITCH_SILENCE_RELEASE_FRAMES = 12;

function absoluteCentsDelta(hzA: number, hzB: number): number {
  if (hzA <= 0 || hzB <= 0) {
    return Infinity;
  }
  return Math.abs(1200 * Math.log2(hzA / hzB));
}

function alignOctaveToReference(hz: number, referenceHz: number): number {
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

function detectFundamentalHz(samples: Float32Array, sampleRate: number): number | null {
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

  // Guard against octave-up harmonic locking.
  let correctedLag = candidateLag;
  const doubledLag = candidateLag * 2;
  if (doubledLag < maxLag) {
    const currentScore = yin[candidateLag];
    const doubledScore = yin[doubledLag];
    if (Number.isFinite(doubledScore) && doubledScore > 0 && doubledScore <= currentScore * 1.25 + 0.004) {
      correctedLag = doubledLag;
    }
  }

  const y0 = yin[correctedLag - 1];
  const y1 = yin[correctedLag];
  const y2 = yin[correctedLag + 1];
  const denominator = 2 * (2 * y1 - y2 - y0);
  const lagRefined =
    denominator !== 0 ? correctedLag + (y2 - y0) / denominator : correctedLag;

  if (!Number.isFinite(lagRefined) || lagRefined <= 0) {
    return null;
  }

  return sampleRate / lagRefined;
}

function buildSwaraGuides(selectedNotes: RagamNoteId[]): Array<{ offset: number; label: string; color: string }> {
  const selectedSet = new Set<RagamNoteId>(selectedNotes);
  const semitoneMap = new Map<number, { labels: string[]; color: string }>();

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

  const guides: Array<{ offset: number; label: string; color: string }> = [];
  for (let offset = SWARA_MIN_OFFSET; offset <= SWARA_MAX_OFFSET; offset += 1) {
    const semitone = ((offset % 12) + 12) % 12;
    const noteForSemitone = semitoneMap.get(semitone);
    if (!noteForSemitone) {
      continue;
    }
    guides.push({
      offset,
      label: noteForSemitone.labels.join("/"),
      color: noteForSemitone.color
    });
  }

  return guides;
}

function buildTracePath(series: FrequencyPoint[], tonicHz: number): string {
  if (series.length < 2) {
    return "";
  }

  return series
    .reduce<string[]>((commands, point) => {
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

function buildPhrasingSeries(series: FrequencyPoint[]): FrequencyPoint[] {
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
      bridged[i] = { t: bridged[i].t, hz: interpolated };
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
        smoothed[i] = { t: bridged[i].t, hz: 2 ** (logSum / count) };
      }
    }

    segmentStart = segmentEnd + 1;
  }

  return smoothed;
}

function stopScheduledSources(sources: AudioScheduledSourceNode[]) {
  for (const source of sources) {
    try {
      source.stop();
    } catch {
      // Source may already be stopped.
    }
  }
  sources.length = 0;
}

function scheduleTanpuraStroke(
  audioContext: AudioContext,
  baseHz: number,
  startTime: number,
  sources: AudioScheduledSourceNode[]
) {
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

function TeacherLogo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="29" className="logo-backdrop logo-teacher" />
      <path
        d="M12 27L32 18L52 27L32 36L12 27ZM22 31V37C22 42 27 45 32 45C37 45 42 42 42 37V31L32 36L22 31Z"
        className="logo-symbol"
      />
      <circle cx="49" cy="30" r="3" className="logo-symbol" />
    </svg>
  );
}

function StudentLogo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="29" className="logo-backdrop logo-student" />
      <circle cx="32" cy="25" r="9" className="logo-symbol" />
      <path
        d="M16 47C16 38.8 23 34 32 34C41 34 48 38.8 48 47V51H16V47Z"
        className="logo-symbol"
      />
    </svg>
  );
}

function GraphCard({
  logo,
  className,
  bpm,
  tonicHz,
  tonicLabel,
  swaraGuides,
  showFrequencyDiagram,
  showPhrasing,
  canRecord,
  hasShrutiSet,
  hasRagamSet,
  hasTalamSet,
  shrutiButtonLabel,
  talamButtonLabel,
  ragamButtonLabel,
  onBpmChange,
  onOpenPopup,
  onRecordingStateChange
}: GraphCardProps) {
  const label = logo === "teacher" ? "Teacher channel" : "Student channel";
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const analysisAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<SVGSVGElement | null>(null);
  const hasSetInitialVerticalFocusRef = useRef(false);
  const recordingStartMsRef = useRef<number>(0);
  const pitchHistoryRef = useRef<number[]>([]);
  const lastStableHzRef = useRef<number | null>(null);
  const silenceFramesRef = useRef(0);
  const octaveCandidateRef = useRef<{ hz: number; direction: 1 | -1; frames: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [frequencySeries, setFrequencySeries] = useState<FrequencyPoint[]>([]);
  const [setupOverlayDismissed, setSetupOverlayDismissed] = useState(false);
  const [chartScrollState, setChartScrollState] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0
  });

  const recorderSupported =
    typeof window !== "undefined" &&
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
      const detectedHz = detectFundamentalHz(analyserData, audioContext.sampleRate);
      let displayHz: number | null = null;
      if (detectedHz !== null) {
        const history = [...pitchHistoryRef.current, detectedHz].slice(-PITCH_MEDIAN_WINDOW);
        pitchHistoryRef.current = history;
        const sorted = [...history].sort((a, b) => a - b);
        displayHz = sorted[Math.floor(sorted.length / 2)];

        const lastStableHz = lastStableHzRef.current;
        if (lastStableHz !== null && displayHz > 0) {
          const continuityAlignedHz = alignOctaveToReference(displayHz, lastStableHz);
          const rawCentsDelta = absoluteCentsDelta(displayHz, lastStableHz);
          const alignedCentsDelta = absoluteCentsDelta(continuityAlignedHz, lastStableHz);

          if (
            previousSilenceFrames < PITCH_OCTAVE_SWITCH_MIN_SILENCE_FRAMES &&
            rawCentsDelta >= PITCH_LARGE_JUMP_CENTS &&
            alignedCentsDelta + PITCH_JUMP_ALIGNMENT_MIN_IMPROVEMENT_CENTS < rawCentsDelta
          ) {
            displayHz = continuityAlignedHz;
          }

          const centsDelta = absoluteCentsDelta(displayHz, lastStableHz);
          if (centsDelta < PITCH_STICKY_CENTS) {
            displayHz = lastStableHz;
            octaveCandidateRef.current = null;
          } else {
            const ratioLog2 = Math.log2(displayHz / lastStableHz);
            const looksLikeOctaveFlip =
              Number.isFinite(ratioLog2) &&
              Math.abs(Math.abs(ratioLog2) - 1) <= PITCH_OCTAVE_RATIO_TOLERANCE;

            if (looksLikeOctaveFlip) {
              const octaveAlignedHz = ratioLog2 > 0 ? displayHz / 2 : displayHz * 2;
              if (previousSilenceFrames < PITCH_OCTAVE_SWITCH_MIN_SILENCE_FRAMES) {
                displayHz = octaveAlignedHz;
                octaveCandidateRef.current = null;
              } else {
                const direction: 1 | -1 = displayHz > lastStableHz ? 1 : -1;
                const currentCandidate = octaveCandidateRef.current;
                const sameDirection = currentCandidate !== null && currentCandidate.direction === direction;
                const similarPitch =
                  currentCandidate !== null &&
                  absoluteCentsDelta(currentCandidate.hz, displayHz) <= 70;
                if (sameDirection && similarPitch) {
                  octaveCandidateRef.current = {
                    hz: displayHz,
                    direction,
                    frames: currentCandidate.frames + 1
                  };
                } else {
                  octaveCandidateRef.current = { hz: displayHz, direction, frames: 1 };
                }

                if ((octaveCandidateRef.current?.frames ?? 0) < PITCH_OCTAVE_ACCEPT_FRAMES) {
                  displayHz = octaveAlignedHz;
                } else {
                  octaveCandidateRef.current = null;
                }
              }
            } else {
              octaveCandidateRef.current = null;
            }
          }
        }
      } else {
        pitchHistoryRef.current = [];
      }

      if (displayHz !== null) {
        lastStableHzRef.current = displayHz;
        silenceFramesRef.current = 0;
      } else {
        silenceFramesRef.current += 1;
        if (silenceFramesRef.current >= PITCH_SILENCE_RELEASE_FRAMES) {
          lastStableHzRef.current = null;
          octaveCandidateRef.current = null;
        }
      }
      const elapsedSeconds = (performance.now() - recordingStartMsRef.current) / 1000;

      setFrequencySeries((prev) => [...prev, { t: elapsedSeconds, hz: displayHz }].slice(-2400));
    }, 45);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRecording]);

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

  const handleBack = () => {
    setRecordingProgress((prev) => Math.max(0, prev - 8));
  };

  const handleForward = () => {
    setRecordingProgress((prev) => Math.min(100, prev + 8));
  };

  const handleJumpToStart = () => {
    setRecordingProgress(0);
  };

  const handleJumpToEnd = () => {
    setRecordingProgress(100);
  };

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
      analyserDataRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT)
      );

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
        mediaStreamRef.current = null;
      };

      setRecordingProgress(0);
      recorder.start();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  };

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

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording();
      return;
    }
    if (canRecord) {
      setSetupOverlayDismissed(true);
    }
    void startRecording();
  };

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

  const handleBpmInput = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.target.value);
    if (Number.isNaN(parsed)) {
      return;
    }
    onBpmChange(parsed);
  };

  const latestTimeSeconds = frequencySeries.length ? frequencySeries[frequencySeries.length - 1].t : 0;
  const maxTimeSeconds = Math.max(
    MIN_SCROLLABLE_TIME_SECONDS,
    Math.ceil(latestTimeSeconds / TIME_TICK_SECONDS) * TIME_TICK_SECONDS
  );
  const plotRightX = Math.max(MIN_PLOT_RIGHT_X, PLOT_LEFT_X + maxTimeSeconds * X_UNITS_PER_SECOND);
  const svgWidthUnits = plotRightX + 2;
  const timeTicks = Array.from(
    { length: Math.floor(maxTimeSeconds / TIME_TICK_SECONDS) + 1 },
    (_, i) => i * TIME_TICK_SECONDS
  );
  const phrasingSeries = useMemo(() => buildPhrasingSeries(frequencySeries), [frequencySeries]);
  const frequencyPath = useMemo(
    () => (showFrequencyDiagram ? buildTracePath(frequencySeries, tonicHz) : ""),
    [showFrequencyDiagram, frequencySeries, tonicHz]
  );
  const phrasingPath = useMemo(
    () => (showPhrasing ? buildTracePath(phrasingSeries, tonicHz) : ""),
    [showPhrasing, phrasingSeries, tonicHz]
  );

  const swaraGuideLines = swaraGuides.map((guide) => {
    const yNormalized = (guide.offset - SWARA_MIN_OFFSET) / (SWARA_MAX_OFFSET - SWARA_MIN_OFFSET);
    const y = (PLOT_BOTTOM_Y - yNormalized * (PLOT_BOTTOM_Y - PLOT_TOP_Y)) * Y_UNITS_TO_PX;
    return { offset: guide.offset, y, label: guide.label, color: guide.color };
  });

  const handleChartScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
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
    .filter(
      (guide) =>
        guide.y >= CHART_PADDING_TOP_PX - 12 &&
        guide.y <= chartScrollState.height - CHART_PADDING_BOTTOM_PX + 12
    );

  const visibleTimeLabels = timeTicks
    .map((tick) => ({
      key: tick,
      label: `${tick}s`,
      x: CHART_PADDING_X_PX + PLOT_LEFT_X + tick * X_UNITS_PER_SECOND - chartScrollState.left
    }))
    .filter(
      (tick) =>
        tick.x >= CHART_PADDING_X_PX - 36 &&
        tick.x <= chartScrollState.width - CHART_PADDING_X_PX + 36
    );

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
    const offsetToPixelY = (offset: number) => {
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
    if (!canRecord) {
      setSetupOverlayDismissed(false);
    }
  }, [canRecord]);

  return (
    <section className={`graph-card ${className ?? ""}`}>
      <header className="graph-card-header">
        <div className="logo-wrap">{logo === "teacher" ? <TeacherLogo /> : <StudentLogo />}</div>
        <div className="recording-bar" role="group" aria-label={`${label} recording controls`}>
          <button
            type="button"
            className="control-button"
            aria-label={`Jump to beginning ${label}`}
            onClick={handleJumpToStart}
          >
            <span className="icon icon-start" />
          </button>
          <button type="button" className="control-button" aria-label={`Back ${label}`} onClick={handleBack}>
            <span className="icon icon-back" />
          </button>
          <button
            type="button"
            className={`control-button control-record${isRecording ? " active" : ""}`}
            aria-label={`Record ${label}`}
            onClick={handleRecordToggle}
            disabled={!recorderSupported || !canRecord}
          >
            <span className="icon icon-record" />
          </button>
          <button type="button" className="control-button" aria-label={`Forward ${label}`} onClick={handleForward}>
            <span className="icon icon-forward" />
          </button>
          <button
            type="button"
            className="control-button"
            aria-label={`Jump to end ${label}`}
            onClick={handleJumpToEnd}
          >
            <span className="icon icon-end" />
          </button>
          <label className="bpm-control">
            <span>BPM</span>
            <input type="number" min={20} max={240} value={bpm} onChange={handleBpmInput} />
          </label>
          <button type="button" className="utility-button utility-button-wide" onClick={() => onOpenPopup("shruti")}>
            {shrutiButtonLabel}
          </button>
          <button type="button" className="utility-button utility-button-wide" onClick={() => onOpenPopup("talam")}>
            {talamButtonLabel}
          </button>
          <button type="button" className="utility-button utility-button-wide" onClick={() => onOpenPopup("ragam")}>
            {ragamButtonLabel}
          </button>
          <button type="button" className="control-button upload-button" aria-label={`Upload for ${label}`}>
            <span className="icon icon-upload" />
          </button>
          {recordedAudioUrl && (
            <button type="button" className="control-button playback-button" onClick={handlePlaybackToggle}>
              <span className={`icon ${isPlayingBack ? "icon-pause" : "icon-play"}`} />
            </button>
          )}
        </div>
        <div className="header-spacer" aria-hidden="true" />
      </header>
      <div className="chart-shell">
        <div ref={chartWrapRef} className="chart-wrap" onScroll={handleChartScroll}>
          <svg
            ref={chartRef}
            className="chart"
            viewBox={`0 0 ${svgWidthUnits} ${CHART_SCROLL_HEIGHT_PX}`}
            preserveAspectRatio="xMinYMin"
            style={{ width: `${svgWidthUnits}px`, height: `${CHART_SCROLL_HEIGHT_PX}px` }}
            role="img"
            aria-label={`${label} frequency by time graph`}
          >
            <rect x="0" y="0" width={svgWidthUnits} height={CHART_SCROLL_HEIGHT_PX} fill="none" />
            <line
              x1={PLOT_LEFT_X}
              y1={PLOT_TOP_Y * Y_UNITS_TO_PX}
              x2={PLOT_LEFT_X}
              y2={PLOT_BOTTOM_Y * Y_UNITS_TO_PX}
              className="axis-line"
            />
            <line
              x1={PLOT_LEFT_X}
              y1={PLOT_BOTTOM_Y * Y_UNITS_TO_PX}
              x2={plotRightX}
              y2={PLOT_BOTTOM_Y * Y_UNITS_TO_PX}
              className="axis-line"
            />
            {swaraGuideLines.map((guide) => {
              return (
                <g key={`swara-${guide.offset}`}>
                  <line
                    x1={PLOT_LEFT_X}
                    y1={guide.y}
                    x2={plotRightX}
                    y2={guide.y}
                    className="swara-grid-line"
                    style={{ stroke: guide.color }}
                  />
                </g>
              );
            })}
            {showFrequencyDiagram && frequencyPath && <path d={frequencyPath} className="frequency-trace" />}
            {showPhrasing && phrasingPath && <path d={phrasingPath} className="phrasing-trace" />}
          </svg>
        </div>
        <div className="axis-overlay" aria-hidden="true">
          {visibleSwaraLabels.map((guide) => (
            <span
              key={`sticky-swara-${guide.key}`}
              className="sticky-axis-label sticky-axis-y"
              style={{ top: `${guide.y}px`, color: guide.color }}
            >
              {guide.label}
            </span>
          ))}
          {visibleTimeLabels.map((tick) => (
            <span
              key={`sticky-time-${tick.key}`}
              className="sticky-axis-label sticky-axis-x"
              style={{ left: `${tick.x}px` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
        {(!setupOverlayDismissed && !isRecording && (!hasShrutiSet || !hasRagamSet || !hasTalamSet)) && (
          <div className="chart-setup-overlay" role="group" aria-label="Recording setup required">
            <div className="chart-setup-card">
              <div className="chart-setup-row">
                <span className="chart-setup-label">Shruthi</span>
                <button
                  type="button"
                  className={`chart-setup-select${hasShrutiSet ? " is-set" : ""}`}
                  onClick={() => onOpenPopup("shruti")}
                >
                  {hasShrutiSet ? shrutiButtonLabel.replace("Shruthi: ", "") : "Select"}
                </button>
              </div>
              <div className="chart-setup-row">
                <span className="chart-setup-label">Ragam</span>
                <button
                  type="button"
                  className={`chart-setup-select${hasRagamSet ? " is-set" : ""}`}
                  onClick={() => onOpenPopup("ragam")}
                >
                  {hasRagamSet ? ragamButtonLabel.replace("Ragam: ", "") : "Select"}
                </button>
              </div>
              <div className="chart-setup-row">
                <span className="chart-setup-label">Talam</span>
                <button
                  type="button"
                  className={`chart-setup-select${hasTalamSet ? " is-set" : ""}`}
                  onClick={() => onOpenPopup("talam")}
                >
                  {hasTalamSet ? talamButtonLabel.replace("Talam: ", "") : "Select"}
                </button>
              </div>
              <p className="chart-setup-hint">
                {canRecord ? "Shruthi and Ragam are set. Talam is optional." : "Set Shruthi and Ragam to enable recording."}
              </p>
              {canRecord && (
                <div className="chart-setup-actions">
                  <button
                    type="button"
                    className="chart-setup-go"
                    onClick={() => setSetupOverlayDismissed(true)}
                    aria-label="Continue to recording"
                  >
                    &rarr;
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {recordedAudioUrl && (
        <audio
          ref={audioPlaybackRef}
          src={recordedAudioUrl}
          onEnded={() => setIsPlayingBack(false)}
          onPause={() => setIsPlayingBack(false)}
          hidden
        />
      )}
    </section>
  );
}

export default function App() {
  const shellRef = useRef<HTMLElement | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const talamAudioContextRef = useRef<AudioContext | null>(null);
  const talamLoopRef = useRef<number | null>(null);
  const talamStepRef = useRef(0);
  const shrutiAudioContextRef = useRef<AudioContext | null>(null);
  const shrutiPreviewSourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const [pageView, setPageView] = useState<PageView>("comparison");
  const [bpm, setBpm] = useState(96);
  const [activePopup, setActivePopup] = useState<"talam" | "ragam" | "shruti" | null>(null);
  const [shrutiLabel, setShrutiLabel] = useState<string>(SHRUTI_OPTIONS[0]?.label ?? "C3");
  const [shrutiHz, setShrutiHz] = useState<number>(SHRUTI_OPTIONS[0]?.hz ?? 130.8128);
  const [pendingShrutiLabel, setPendingShrutiLabel] = useState<string>(SHRUTI_OPTIONS[0]?.label ?? "C3");
  const [pendingShrutiHz, setPendingShrutiHz] = useState<number>(SHRUTI_OPTIONS[0]?.hz ?? 130.8128);
  const [hasShrutiSet, setHasShrutiSet] = useState(false);
  const [ragamName, setRagamName] = useState<string>("");
  const [ragamSelectedNotes, setRagamSelectedNotes] = useState<RagamNoteId[]>(DEFAULT_RAGAM_NOTES);
  const [pendingRagamName, setPendingRagamName] = useState<string>("");
  const [pendingRagamNotes, setPendingRagamNotes] = useState<RagamNoteId[]>(DEFAULT_RAGAM_NOTES);
  const [hasRagamSet, setHasRagamSet] = useState(false);
  const [talamName, setTalamName] = useState("");
  const [talamBpm, setTalamBpm] = useState(96);
  const [talamBeats, setTalamBeats] = useState(8);
  const [talamPattern, setTalamPattern] = useState<number[]>(() => Array(8).fill(0));
  const [isTalamPlaying, setIsTalamPlaying] = useState(false);
  const [currentBeatIndex, setCurrentBeatIndex] = useState<number | null>(null);
  const [hasTalamSet, setHasTalamSet] = useState(false);
  const [layersEnabled, setLayersEnabled] = useState<Record<LayerKey, boolean>>({
    layer1: true,
    layer2: false,
    layer3: false,
    layer4: false,
    layer5: false
  });
  const [recordingByCard, setRecordingByCard] = useState<Record<"teacher" | "student", boolean>>({
    teacher: false,
    student: false
  });
  const isAnyRecording = recordingByCard.teacher || recordingByCard.student;
  const swaraGuides = buildSwaraGuides(ragamSelectedNotes);
  const canRecord = hasShrutiSet && hasRagamSet;
  const shrutiButtonLabel = hasShrutiSet ? `Shruthi: ${shrutiLabel}` : "Set Shruthi";
  const ragamButtonLabel = hasRagamSet ? `Ragam: ${ragamName.trim() || "Selected"}` : "Set Ragam";
  const talamButtonLabel = hasTalamSet ? `Talam: ${talamName.trim() || `${talamBeats} beats`}` : "Set Talam";

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

    const playStep = (stepIndex: number) => {
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

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = (event.clientX - rect.left) / rect.width - 0.5;
    const normalizedY = (event.clientY - rect.top) / rect.height - 0.5;
    const x = normalizedX * 96;
    const y = normalizedY * 74;
    targetRef.current = { x, y };
  }, []);

  const handlePointerLeave = useCallback(() => {
    targetRef.current = { x: 0, y: 0 };
  }, []);

  const handlePageViewChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setPageView(event.target.value as PageView);
  }, []);

  const handleTeacherRecordingState = useCallback((isRecording: boolean) => {
    setRecordingByCard((prev) => (prev.teacher === isRecording ? prev : { ...prev, teacher: isRecording }));
  }, []);

  const handleStudentRecordingState = useCallback((isRecording: boolean) => {
    setRecordingByCard((prev) => (prev.student === isRecording ? prev : { ...prev, student: isRecording }));
  }, []);

  const handleLayerToggle = useCallback((layerKey: LayerKey) => {
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

  const handleBpmChange = useCallback((value: number) => {
    const bounded = Math.max(20, Math.min(240, Math.round(value)));
    setBpm(bounded);
  }, []);

  const playShrutiPreview = useCallback((baseHz: number) => {
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

    const sequenceSemitones = [7, 12, 12, 0];
    const sequenceStart = audioContext.currentTime + 0.04;
    const strokeInterval = 0.75;
    sequenceSemitones.forEach((semitoneOffset, index) => {
      const strokeHz = baseHz * 2 ** (semitoneOffset / 12);
      const strokeStart = sequenceStart + index * strokeInterval;
      scheduleTanpuraStroke(audioContext, strokeHz, strokeStart, shrutiPreviewSourcesRef.current);
    });
  }, []);

  const handleClosePopup = useCallback(() => {
    setActivePopup(null);
    setIsTalamPlaying(false);
  }, []);

  const handleOpenPopup = useCallback((kind: "talam" | "ragam" | "shruti") => {
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

  const handleTalamBeatChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.target.value);
    if (Number.isNaN(parsed)) {
      return;
    }
    const bounded = Math.max(1, Math.min(44, Math.floor(parsed)));
    setTalamBeats(bounded);
  }, []);

  const toggleTalamBeatState = useCallback((index: number) => {
    setTalamPattern((prev) =>
      prev.map((value, i) => {
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
      })
    );
  }, []);

  const handleTalamBpmChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.target.value);
    if (Number.isNaN(parsed)) {
      return;
    }
    const bounded = Math.max(20, Math.min(240, Math.round(parsed)));
    setTalamBpm(bounded);
  }, []);

  const handleSetTalam = useCallback(() => {
    setBpm(talamBpm);
    setHasTalamSet(true);
    handleClosePopup();
  }, [handleClosePopup, talamBpm]);

  const handleSetShruti = useCallback(() => {
    setShrutiHz(pendingShrutiHz);
    setShrutiLabel(pendingShrutiLabel);
    setHasShrutiSet(true);
    handleClosePopup();
  }, [handleClosePopup, pendingShrutiHz, pendingShrutiLabel]);

  const togglePendingRagamNote = useCallback((noteId: RagamNoteId) => {
    setPendingRagamNotes((prev) => {
      if (prev.includes(noteId)) {
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter((item) => item !== noteId);
      }

      const nextSet = new Set<RagamNoteId>([...prev, noteId]);
      for (const [a, b] of INCOMPATIBLE_RAGAM_NOTE_PAIRS) {
        if (noteId === a && nextSet.has(b)) {
          nextSet.delete(b);
        }
        if (noteId === b && nextSet.has(a)) {
          nextSet.delete(a);
        }
      }
      return RAGAM_NOTE_OPTIONS.map((note) => note.id).filter((id) => nextSet.has(id));
    });
  }, []);

  const handleSetRagam = useCallback(() => {
    setRagamSelectedNotes(pendingRagamNotes);
    setRagamName(pendingRagamName.trim());
    setHasRagamSet(true);
    handleClosePopup();
  }, [handleClosePopup, pendingRagamName, pendingRagamNotes]);

  return (
    <main
      ref={shellRef}
      className="page-shell"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="syn-layer syn-a" aria-hidden="true" />
      <div className="syn-layer syn-b" aria-hidden="true" />
      <div className="syn-layer syn-c" aria-hidden="true" />
      <div className="syn-layer syn-d" aria-hidden="true" />
      <div className="syn-layer syn-e" aria-hidden="true" />
      <div className="content">
        <div className="layout-shell">
          <div className="page-main">
            <div className="page-top">
              <h1>Soundscape Monitor</h1>
            </div>
            <div className={`graphs view-${pageView}`}>
              {pageView === "teacher-focus" && (
                <GraphCard
                  logo="teacher"
                  className="focus-card"
                  bpm={bpm}
                  tonicHz={shrutiHz}
                  tonicLabel={shrutiLabel}
                  swaraGuides={swaraGuides}
                  showFrequencyDiagram={layersEnabled.layer1}
                  showPhrasing={layersEnabled.layer2}
                  canRecord={canRecord}
                  hasShrutiSet={hasShrutiSet}
                  hasRagamSet={hasRagamSet}
                  hasTalamSet={hasTalamSet}
                  shrutiButtonLabel={shrutiButtonLabel}
                  talamButtonLabel={talamButtonLabel}
                  ragamButtonLabel={ragamButtonLabel}
                  onBpmChange={handleBpmChange}
                  onOpenPopup={handleOpenPopup}
                  onRecordingStateChange={handleTeacherRecordingState}
                />
              )}
              {pageView === "student-focus" && (
                <GraphCard
                  logo="student"
                  className="focus-card"
                  bpm={bpm}
                  tonicHz={shrutiHz}
                  tonicLabel={shrutiLabel}
                  swaraGuides={swaraGuides}
                  showFrequencyDiagram={layersEnabled.layer1}
                  showPhrasing={layersEnabled.layer2}
                  canRecord={canRecord}
                  hasShrutiSet={hasShrutiSet}
                  hasRagamSet={hasRagamSet}
                  hasTalamSet={hasTalamSet}
                  shrutiButtonLabel={shrutiButtonLabel}
                  talamButtonLabel={talamButtonLabel}
                  ragamButtonLabel={ragamButtonLabel}
                  onBpmChange={handleBpmChange}
                  onOpenPopup={handleOpenPopup}
                  onRecordingStateChange={handleStudentRecordingState}
                />
              )}
              {(pageView === "comparison" || pageView === "side-by-side") && (
                <>
                  <GraphCard
                    logo="teacher"
                    bpm={bpm}
                    tonicHz={shrutiHz}
                    tonicLabel={shrutiLabel}
                    swaraGuides={swaraGuides}
                    showFrequencyDiagram={layersEnabled.layer1}
                    showPhrasing={layersEnabled.layer2}
                    canRecord={canRecord}
                    hasShrutiSet={hasShrutiSet}
                    hasRagamSet={hasRagamSet}
                    hasTalamSet={hasTalamSet}
                    shrutiButtonLabel={shrutiButtonLabel}
                    talamButtonLabel={talamButtonLabel}
                    ragamButtonLabel={ragamButtonLabel}
                    onBpmChange={handleBpmChange}
                    onOpenPopup={handleOpenPopup}
                    onRecordingStateChange={handleTeacherRecordingState}
                  />
                  <GraphCard
                    logo="student"
                    bpm={bpm}
                    tonicHz={shrutiHz}
                    tonicLabel={shrutiLabel}
                    swaraGuides={swaraGuides}
                    showFrequencyDiagram={layersEnabled.layer1}
                    showPhrasing={layersEnabled.layer2}
                    canRecord={canRecord}
                    hasShrutiSet={hasShrutiSet}
                    hasRagamSet={hasRagamSet}
                    hasTalamSet={hasTalamSet}
                    shrutiButtonLabel={shrutiButtonLabel}
                    talamButtonLabel={talamButtonLabel}
                    ragamButtonLabel={ragamButtonLabel}
                    onBpmChange={handleBpmChange}
                    onOpenPopup={handleOpenPopup}
                    onRecordingStateChange={handleStudentRecordingState}
                  />
                </>
              )}
            </div>
          </div>
          <aside className="controls-sidebar" aria-label="Page controls">
            <div className="controls-group">
              <label htmlFor="page-view-select" className="settings-group-title">
                Page view
              </label>
              <select
                id="page-view-select"
                className="page-view-select"
                value={pageView}
                onChange={handlePageViewChange}
              >
                {pageViewOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-toggles">
              {layerOptions.map((layer) => (
                <button
                  key={layer.key}
                  type="button"
                  className="settings-toggle"
                  role="switch"
                  aria-checked={layersEnabled[layer.key]}
                  disabled={isAnyRecording && layer.key !== "layer1"}
                  onClick={() => handleLayerToggle(layer.key)}
                >
                  <span>{layer.label}</span>
                  <span className={`toggle-ui${layersEnabled[layer.key] ? " on" : ""}`} aria-hidden="true">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              ))}
            </div>
            <div className="settings-divider" aria-hidden="true" />
            <div className="settings-group-title muted">More options</div>
            <div className="settings-item placeholder" aria-hidden="true" />
            <div className="settings-item placeholder" aria-hidden="true" />
          </aside>
        </div>
      </div>
      {activePopup && (
        <div className="control-modal-backdrop" onClick={handleClosePopup} role="presentation">
          <div
            className="control-modal"
            role="dialog"
            aria-label={
              activePopup === "talam" ? "Talam popup" : activePopup === "shruti" ? "Shruti popup" : "Ragam popup"
            }
            onClick={(event) => event.stopPropagation()}
          >
            {activePopup === "talam" ? (
              <div className="talam-popup">
                <h2>Set Talam</h2>
                <label className="talam-input-row talam-name-row">
                  <span>Talam name</span>
                  <input
                    type="text"
                    value={talamName}
                    maxLength={48}
                    onChange={(event) => setTalamName(event.target.value)}
                    placeholder="Enter name"
                  />
                </label>
                <label className="talam-input-row">
                  <span>BPM</span>
                  <input type="number" min={20} max={240} value={talamBpm} onChange={handleTalamBpmChange} />
                </label>
                <label className="talam-input-row">
                  <span>Beats per cycle</span>
                  <input type="number" min={1} max={44} value={talamBeats} onChange={handleTalamBeatChange} />
                </label>
                <div className="talam-grid" role="group" aria-label="Talam beat pattern">
                  {Array.from({ length: talamBeats }, (_, index) => (
                    <button
                      key={`beat-${index}`}
                      type="button"
                      className={`talam-box${talamPattern[index] === 2 ? " high" : ""}${
                        talamPattern[index] === 1 ? " low" : ""
                      }${currentBeatIndex === index ? " active" : ""}`}
                      onClick={() => toggleTalamBeatState(index)}
                      aria-label={`Beat ${index + 1}`}
                    />
                  ))}
                </div>
                <div className="talam-actions">
                  <button type="button" className="talam-play" onClick={() => setIsTalamPlaying((prev) => !prev)}>
                    {isTalamPlaying ? "Stop" : "Play"}
                  </button>
                </div>
                <div className="talam-actions">
                  <button type="button" className="talam-set" onClick={handleSetTalam}>
                    Set
                  </button>
                </div>
              </div>
            ) : (
              <>
                {activePopup === "shruti" ? (
                  <div className="shruti-popup">
                    <h2>Set Shruti</h2>
                    <div className="shruti-controls">
                      <label>
                        Tonic (S)
                        <div className="shruti-picker-row">
                          <select
                            value={pendingShrutiLabel}
                            onChange={(event) => {
                              const selected = SHRUTI_OPTIONS.find((item) => item.label === event.target.value);
                              if (!selected) {
                                return;
                              }
                              setPendingShrutiLabel(selected.label);
                              setPendingShrutiHz(selected.hz);
                              playShrutiPreview(selected.hz);
                            }}
                          >
                            {SHRUTI_OPTIONS.map((option) => (
                              <option key={option.label} value={option.label}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="shruti-play-button"
                            onClick={() => playShrutiPreview(pendingShrutiHz)}
                            aria-label="Play shruti preview"
                          >
                            ▶
                          </button>
                        </div>
                      </label>
                      <div className="shruti-preview">{pendingShrutiLabel} = {pendingShrutiHz.toFixed(2)} Hz</div>
                      <button type="button" className="talam-set" onClick={handleSetShruti}>
                        Set
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ragam-popup">
                    <h2>Set Ragam</h2>
                    <label className="talam-input-row talam-name-row">
                      <span>Ragam name</span>
                      <input
                        type="text"
                        value={pendingRagamName}
                        maxLength={48}
                        onChange={(event) => setPendingRagamName(event.target.value)}
                        placeholder="Enter name"
                      />
                    </label>
                    <div className="ragam-grid" role="group" aria-label="Ragam note selection">
                      {RAGAM_NOTE_OPTIONS.map((note) => {
                        const selected = pendingRagamNotes.includes(note.id);
                        return (
                          <button
                            key={note.id}
                            type="button"
                            className={`ragam-note${selected ? " on" : ""}`}
                            onClick={() => togglePendingRagamNote(note.id)}
                            style={{ borderColor: note.color }}
                            aria-pressed={selected}
                          >
                            {note.id}
                          </button>
                        );
                      })}
                    </div>
                    <div className="ragam-preview">
                      <span>Name:</span>
                      <strong>{pendingRagamName.trim() || ragamName || "Untitled"}</strong>
                    </div>
                    <div className="talam-actions">
                      <button type="button" className="talam-set" onClick={handleSetRagam}>
                        Set
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
