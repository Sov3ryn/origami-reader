import { detectLanguage, loadLanguage, t } from "../../src/i18n";
import { LanguagePicker } from "../../src/components/LanguagePicker";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { installationPlan } from "./model";
const native = "__TAURI_INTERNALS__" in window;
import { PresetPicker } from "./PresetPicker";
import { getPreset, presetOptions, surfaceNames } from "./presets";
import imageModelLicense from "../../docs/licenses/DreamShaper-OpenRAIL-M.txt?raw";
import turboModelLicense from "../../docs/licenses/SD-Turbo-LICENSE.txt?raw";
import appLicense from "../../APP-LICENSE.md?raw";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Folder,
  Globe2,
  HardDrive,
  Layers3,
  Monitor,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import {
  defaultPath,
  initialOptions,
  languages,
  packageLanguages,
  pathError,
  platforms,
  type Platform,
  type SetupOptions,
} from "./model";

const steps = [
  "Welcome",
  "Installation",
  "Language packs",
  "Appearance",
  "Preferences",
  "Review",
];
const stepIcons = [
  BookOpen,
  HardDrive,
  Globe2,
  Sparkles,
  Settings2,
  CheckCheck,
];
const phases = [
  "Preparing your setup",
  "Installing Origami Reader",
  "Preparing selected language packs",
  "Preparing selected models",
  "Applying your preferences",
  "Finishing setup",
];

// Stable variation keeps the breeze continuous when setup choices change.
const petals = Array.from(
  { length: 28 },
  (_, index) =>
    ({
      "--petal-top": `${(index * 37) % 100}%`,
      "--petal-size": `${7 + ((index * 3) % 9)}px`,
      "--petal-duration": `${24 + ((index * 7) % 19)}s`,
      "--petal-delay": `${-((index * 11) % 43)}s`,
      "--petal-turn": `${5 + (index % 5)}s`,
      "--petal-opacity": 0.24 + (index % 4) * 0.09,
    }) as CSSProperties,
);

function Toggle({
  label,
  detail,
  checked,
  onChange,
  disabled = false,
}: {
  disabled?: boolean;
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
// Progress lines from the installer script, in the setup's language.
function progressText(message: string) {
  const fixed: Record<string, string> = {
    "Installing speech packages": t("Installing speech packages"),
    "Installing light voice packages": t("Installing light voice packages"),
    "Preparing package installation": t("Preparing package installation"),
    "Removing the earlier version": t("Removing the earlier version"),
    "Applying your preferences": t("Applying your preferences"),
    "Installing Origami": t("Installing Origami"),
  };
  if (fixed[message]) return fixed[message];
  const downloading = message.match(/^Downloading (.+)$/);
  if (downloading) return t("Downloading {name}", { name: downloading[1] });
  const preparing = message.match(/^Preparing (.+)$/);
  if (preparing) return t("Preparing {name}", { name: preparing[1] });
  const installing = message.match(/^Installing (.+)$/);
  if (installing) return t("Installing {name}", { name: installing[1] });
  return t(message);
}
// Messages from the installer script, in the setup's language when known.
function setupMessage(message: string) {
  const known: Record<string, string> = {
    "Choose a new, empty application folder. Existing installations are kept intact.": t("Choose a new, empty application folder. Existing installations are kept intact."),
    "There is not enough free space in the installation location.": t("There is not enough free space in the installation location."),
    "Choose a destination outside the extracted setup package.": t("Choose a destination outside the extracted setup package."),
    "Accept the image model license before installing that model.": t("Accept the image model license before installing that model."),
    "Installation cancelled. Your selections have been kept.": t("Installation cancelled. Your selections have been kept."),
  };
  return known[message] || message;
}
type DownloadGroup = { bytes?: number; voices?: number; estimate?: number | Record<string, number> };
export default function App() {
  const [options, setOptions] = useState<SetupOptions>(() => ({
    ...initialOptions(),
    ...(native
      ? {
          languages: ["en", "fr"],
          coverModel: true,
          portraitModel: true,
          updates: true,
        }
      : {}),
  }));
  const [installMessage, setInstallMessage] = useState("");
  const [installError, setInstallError] = useState("");
  // Folder of an earlier Origami found by setup, offered for replacement.
  const [earlier, setEarlier] = useState("");
  const [terms, setTerms] = useState(false);
  // Origami Reader's own license, accepted before installing.
  const [appTerms, setAppTerms] = useState(false);
  const [packageReady, setPackageReady] = useState(!native);
  const [packageSize, setPackageSize] = useState(0);
  // Online kits: what each optional group downloads (see installer/downloads.json).
  const [downloads, setDownloads] = useState<Record<string, DownloadGroup> | null>(null);
  // Optional model packs present in this kit.
  const [hasLight, setHasLight] = useState(!native);
  const [hasTurbo, setHasTurbo] = useState(!native);
  const [availableLanguages, setAvailableLanguages] = useState(
    native ? ([] as typeof languages) : languages,
  );
  const [warnings, setWarnings] = useState<string[]>([]);
  // The installer starts in the operating system language; the choice is
  // also saved as the reader's interface language.
  const [, setLanguageVersion] = useState(0);
  const [system, setSystem] = useState<{
    platform: Platform;
    arch: string;
    gpus: string[];
    speech: "cuda" | "rocm" | "mps" | "cpu";
  } | null>(null);
  useEffect(() => {
    if (!native) return;
    void invoke<{
      os: string;
      arch: string;
      gpus: string[];
      speech: "cuda" | "rocm" | "mps" | "cpu";
    }>("system_info")
      .then((info) =>
        setSystem({
          platform:
            info.os === "macos"
              ? "macos"
              : info.os === "linux"
                ? "linux"
                : "windows",
          arch:
            info.arch === "x86_64"
              ? "x64"
              : info.arch === "aarch64"
                ? "ARM64"
                : info.arch,
          gpus: info.gpus,
          speech: info.speech,
        }),
      )
      .catch(() => {});
  }, []);
  useEffect(() => {
    void loadLanguage(detectLanguage()).then(() =>
      setLanguageVersion((v) => v + 1),
    );
  }, []);
  function changeLanguage(code: string) {
    setOptions((prev) => ({ ...prev, uiLanguage: code }));
    void loadLanguage(code || detectLanguage()).then(() =>
      setLanguageVersion((v) => v + 1),
    );
  }
  useEffect(() => {
    if (!native) return;
    void invoke<{
      platform: Platform;
      totalBytes: number;
      files: { group: string; path: string }[];
      downloads?: { groups: Record<string, DownloadGroup> };
    }>("package_info")
      .then((info) => {
        const groups = info.downloads?.groups;
        setDownloads(groups || null);
        const packs = groups
          ? languages.flatMap((l) => {
              const g = groups[`voices-${l.id}`];
              return g ? [{ ...l, count: g.voices || l.count }] : [];
            })
          : packageLanguages(info.files);
        setAvailableLanguages(packs);
        const light = info.files.some((f) => f.group === "speech-light") || Boolean(groups?.["speech-light"]);
        const turbo = info.files.some((f) => f.group === "images-turbo") || Boolean(groups?.["images-turbo"]);
        setHasLight(light);
        setHasTurbo(turbo);
        setOptions((previous) => ({
          ...previous,
          // Online, only English is ticked at first: each pack is a download.
          languages: groups ? packs.filter((pack) => pack.id === "en").map((pack) => pack.id) : packs.map((pack) => pack.id),
          lightVoices: light && previous.lightVoices,
          turboModel: turbo && previous.turboModel,
          platform: info.platform,
          installPath: defaultPath(info.platform, "user"),
        }));
        setPackageSize(info.totalBytes);
        setPackageReady(true);
      })
      .catch((error) => setInstallError(String(error)));
    const progressListener = listen<{
      percent?: number;
      message?: string;
      file?: string;
    }>("install-progress", ({ payload }) => {
      if (payload.percent !== undefined) setProgress(payload.percent);
      if (payload.message)
        setInstallMessage(
          progressText(payload.message) + (payload.file ? ` · ${payload.file}` : ""),
        );
    });
    const closeListener = listen("install-close-requested", () =>
      setCancel(true),
    );
    return () => {
      void progressListener.then((unlisten) => unlisten());
      void closeListener.then((unlisten) => unlisten());
    };
  }, []);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderMessage, setFolderMessage] = useState("");
  const [finishedAction, setFinishedAction] = useState<
    "launch" | "close" | null
  >(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const folderDialog = useRef<HTMLDialogElement>(null);
  const update = <K extends keyof SetupOptions>(
    key: K,
    value: SetupOptions[K],
  ) => setOptions((prev) => ({ ...prev, [key]: value }));
  const preset = getPreset(options.background);
  const selected = availableLanguages.filter((item) =>
    options.languages.includes(item.id),
  );
  const voices = selected.reduce((sum, language) => sum + language.count, 0);
  const packagedVoices = availableLanguages.reduce(
    (sum, language) => sum + language.count,
    0,
  );
  const error = pathError(options.platform, options.installPath);
  const phase = Math.min(
    phases.length - 1,
    Math.floor(progress / (100 / phases.length)),
  );
  const reduced = options.motion === "reduced";
  const platformName = platforms.find(
    (item) => item.id === options.platform,
  )!.name;
  const selectedModels = [
    options.speech && "Qwen voices",
    options.coverModel && "Book cover model",
    options.portraitModel && "Portrait model",
    hasLight && options.lightVoices && "Light voices",
    hasTurbo && options.turboModel && "Fast picture model",
  ].filter(Boolean) as string[];
  const folderError = pathError(options.platform, folderDraft);
  // What setup will download for the current choices, in bytes.
  const downloadBytes = (() => {
    if (!downloads) return 0;
    const device = system?.speech === "cuda" ? "cuda" : "cpu";
    const chosen = new Set<string>(["core"]);
    if (options.speech || (hasLight && options.lightVoices)) chosen.add("speech");
    if (options.speech) {
      chosen.add("speech-qwen");
      options.languages.forEach((id) => chosen.add(`voices-${id}`));
    }
    if (hasLight && options.lightVoices) chosen.add("speech-light");
    if (options.coverModel || options.portraitModel) ["images", "image-runtime"].forEach((g) => chosen.add(g));
    if (hasTurbo && options.turboModel) ["images-turbo", "image-runtime"].forEach((g) => chosen.add(g));
    let sum = 0;
    for (const id of chosen) {
      const g = downloads[id];
      if (!g) continue;
      sum += g.bytes || 0;
      const e = g.estimate;
      sum += typeof e === "number" ? e : e ? e[device] || 0 : 0;
    }
    return sum;
  })();

  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (help) helpDialog.current?.showModal();
    else helpDialog.current?.close();
  }, [help]);
  useEffect(() => {
    if (cancel) cancelDialog.current?.showModal();
    else cancelDialog.current?.close();
  }, [cancel]);
  useEffect(() => {
    if (folderOpen) folderDialog.current?.showModal();
    else folderDialog.current?.close();
  }, [folderOpen]);
  useEffect(() => {
    if (native || step !== 6 || paused || cancel) return;
    const timer = window.setInterval(
      () => setProgress((value) => Math.min(100, value + 0.8)),
      180,
    );
    return () => window.clearInterval(timer);
  }, [step, paused, cancel]);
  useEffect(() => {
    if (!native && progress >= 100 && step === 6) setStep(7);
  }, [progress, step]);

  function changePlatform(platform: Platform) {
    setOptions((prev) => ({
      ...prev,
      platform,
      installPath: defaultPath(platform, prev.scope),
    }));
  }
  function changeScope(scope: SetupOptions["scope"]) {
    setOptions((prev) => ({
      ...prev,
      scope,
      installPath: defaultPath(prev.platform, scope),
    }));
  }
  function toggleLanguage(id: string) {
    setOptions((prev) => ({
      ...prev,
      languages: prev.languages.includes(id)
        ? prev.languages.filter((item) => item !== id)
        : [...prev.languages, id],
      speech: true,
    }));
  }
  function openFolder() {
    setFolderDraft(options.installPath);
    setFolderMessage("");
    setFolderOpen(true);
  }
  async function browseFolder() {
    if (native) {
      setFolderBusy(true);
      try {
        const path = await invoke<string | null>("choose_folder");
        if (path)
          setFolderDraft(
            path.replace(/[\\/]+$/, "") +
              (options.platform === "windows" ? "\\Origami" : "/Origami"),
          );
      } catch (error) {
        setFolderMessage(String(error));
      } finally {
        setFolderBusy(false);
      }
      return;
    }
    if (window.location.hostname !== "127.0.0.1") {
      setFolderMessage(
        "System folder browsing is available in the local preview. In this portable copy, enter your preferred location below.",
      );
      return;
    }
    if (initialOptions().platform !== options.platform) {
      setFolderMessage(
        t(
          "You are previewing {platformName}. Enter a {platformName2} location below, or switch to this computer's platform to browse.",
          { platformName: platformName, platformName2: platformName },
        ),
      );
      return;
    }
    setFolderBusy(true);
    setFolderMessage("");
    try {
      const response = await fetch("/__installer/folder", { method: "POST" });
      const result = (await response.json()) as {
        path?: string | null;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Folder browsing is unavailable.");
      if (result.path) {
        const separator = options.platform === "windows" ? "\\" : "/";
        const directory = result.path.replace(/[\\/]+$/, "");
        const name = options.platform === "macos" ? "Origami.app" : "Origami";
        setFolderDraft(
          directory.toLowerCase().endsWith(`${separator}${name}`.toLowerCase())
            ? directory
            : `${directory}${separator}${name}`,
        );
      }
    } catch (error) {
      setFolderMessage(
        error instanceof Error
          ? error.message
          : "Folder browsing is unavailable. Enter a location below.",
      );
    } finally {
      setFolderBusy(false);
    }
  }
  function finish(action: "launch" | "close") {
    if (native) {
      void invoke("finish", { launch: action === "launch" }).catch((error) =>
        setInstallError(String(error)),
      );
      return;
    }
    setFinishedAction(action);
    // The payload-free preview cannot launch an installed application.
    if (action === "close") window.close();
  }
  async function startPreview(replaceEarlier = false) {
    setInstallError("");
    setEarlier("");
    setInstallMessage("Preparing your setup");
    setProgress(0);
    setPaused(false);
    setStep(6);
    if (native) {
      try {
        const result = await invoke<{ warnings: string[] }>("install", {
          options: {
            ...installationPlan(options),
            modelTermsAccepted: terms,
            lightVoices: hasLight && options.lightVoices,
            turboModel: hasTurbo && options.turboModel,
            speechDevice: system?.speech || "cpu",
            replaceEarlier,
            amdSpeech:
              options.speech && options.amdSpeech && system?.speech === "rocm",
          },
        });
        setWarnings(result.warnings);
        setStep(7);
      } catch (error) {
        const message = String(error).replace(/^Error:\s*/, "");
        // An earlier version is installed: ask before replacing it.
        const found = message.match(/EARLIER:(.+)$/);
        if (found) setEarlier(found[1].trim());
        else setInstallError(message);
        setStep(5);
      }
    }
  }
  function title(eyebrow: string, name: string, description: string) {
    return (
      <header className="page-heading">
        <p className="eyebrow">{t(eyebrow)}</p>
        <h1 ref={heading} tabIndex={-1}>
          {t(name)}
        </h1>
        <p>{t(description)}</p>
      </header>
    );
  }
  function summaryRow(label: string, content: ReactNode, target: number) {
    return (
      <div className="summary-row">
        <span>{t(label)}</span>
        <strong>{typeof content === "string" ? t(content) : content}</strong>
        <button
          className="text-button"
          onClick={() => setStep(target)}
          aria-label={t("Edit {section}", { section: t(label) })}
        >
          {t("Edit")}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`setup ${reduced ? "reduced-motion" : ""} ${options.scene ? "with-scene" : "without-scene"}`}
    >
      <div className="ambient" aria-hidden="true">
        <div className="ambient-glow" />
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="wind-petals">
          {petals.map((style, index) => (
            <span className="wind-petal" style={style} key={index}>
              <i />
            </span>
          ))}
        </div>
      </div>
      <div className="installer">
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (step < 6) setStep(0);
            }}
            aria-label={t("Origami setup home")}
          >
            <img src="./crane.png" alt="" />
            <span>
              {t("Origami")}
              <small>{t("READER SETUP")}</small>
            </span>
          </a>
          <nav aria-label={t("Setup steps")}>
            <ol>
              {steps.map((name, index) => {
                const Icon = stepIcons[index];
                return (
                  <li
                    key={name}
                    className={`${index === step ? "active" : ""} ${index < step ? "visited" : ""}`}
                  >
                    <button
                      disabled={step >= 6 || index > step}
                      aria-label={t(name)}
                      aria-current={index === step ? "step" : undefined}
                      onClick={() => setStep(index)}
                    >
                      <span className="step-icon">
                        {index < step ? (
                          <Check size={16} />
                        ) : (
                          <Icon size={17} />
                        )}
                      </span>
                      <span>{t(name)}</span>
                      {index === step && <i />}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="sidebar-scene">
            <div className="scene-caption">
              <Moon size={17} />
              <span>
                {t("Plum Nocturne")}
                <small>{t("The signature Origami palette")}</small>
              </span>
            </div>
          </div>
          <div className="sidebar-bottom">
            <ShieldCheck size={15} />
            <span>{t("Installation preferences")}</span>
          </div>
        </aside>
        <main>
          <div className="topbar">
            <span className="preview-badge">
              <i /> {native ? t("BETA INSTALLER") : t("INTERFACE PREVIEW")}
            </span>
            <div className="topbar-actions">
              <label className="platform-select">
                <Monitor size={14} />
                <span className="sr-only">{t("Preview platform")}</span>
                <select
                  aria-label={native ? "Detected platform" : "Preview platform"}
                  value={options.platform}
                  disabled={native || step >= 6}
                  onChange={(e) => changePlatform(e.target.value as Platform)}
                >
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} />
              </label>
              <button
                className="icon-button"
                aria-label={
                  native ? "About this installer" : "About this preview"
                }
                onClick={() => setHelp(true)}
              >
                <CircleHelp size={18} />
              </button>
            </div>
          </div>
          <div className={`content step-${step}`}>
            {installError && (
              <p className="error" role="alert">
                {setupMessage(installError)}
              </p>
            )}
            {earlier && (
              <div className="info-card" role="alert">
                <div>
                  <strong>{t("An earlier version of Origami is installed")}</strong>
                  <p>
                    {t(
                      "It is in {folder}. Setup can replace it with this version. Your library, notes, cards and settings are kept.",
                      { folder: earlier },
                    )}
                  </p>
                  <button className="primary" onClick={() => void startPreview(true)}>
                    {t("Replace it and install")}
                  </button>
                </div>
              </div>
            )}
            {native && step === 5 && (
              <div className="info-card">
                <div>
                  <strong>{t("Origami Reader license")}</strong>
                  <p>
                    {t(
                      "Origami Reader is free to use at home, school or work. Copies may not be shared, sold or modified. Made by Sov3ryn.",
                    )}
                  </p>
                  <details open={!appTerms}>
                    <summary>{t("Read the Origami Reader license")}</summary>
                    <pre
                      className="license-text"
                      aria-label={t("Origami Reader license")}
                      tabIndex={0}
                    >
                      {appLicense}
                    </pre>
                  </details>
                  <label>
                    <input
                      type="checkbox"
                      checked={appTerms}
                      onChange={(e) => setAppTerms(e.target.checked)}
                    />{" "}
                    {t("I agree to the Origami Reader license.")}
                  </label>
                </div>
              </div>
            )}
            {native &&
              step === 5 &&
              (options.coverModel || options.portraitModel || (hasTurbo && options.turboModel)) && (
                <div className="info-card">
                  <div>
                    <strong>{t("Image model license")}</strong>
                    {(options.coverModel || options.portraitModel) && (
                      <>
                        <p>
                          {t(
                            "DreamShaper is provided under CreativeML OpenRAIL-M. Its use restrictions apply to generated content and redistribution.",
                          )}
                        </p>
                        <details open={!terms}>
                          <summary>{t("Read the image model license")}</summary>
                          <pre
                            className="license-text"
                            aria-label={t("CreativeML OpenRAIL-M")}
                            tabIndex={0}
                          >
                            {imageModelLicense}
                          </pre>
                        </details>
                      </>
                    )}
                    {hasTurbo && options.turboModel && (
                      <>
                        <p>
                          {t(
                            "SD-Turbo is provided under the Stability AI Community License. Powered by Stability AI.",
                          )}
                        </p>
                        <details open={!terms}>
                          <summary>{t("Read the SD-Turbo license")}</summary>
                          <pre
                            className="license-text"
                            aria-label={t("Stability AI Community License")}
                            tabIndex={0}
                          >
                            {turboModelLicense}
                          </pre>
                        </details>
                      </>
                    )}
                    <label>
                      <input
                        type="checkbox"
                        checked={terms}
                        onChange={(e) => setTerms(e.target.checked)}
                      />{" "}
                      {t(
                        "I agree to the image model license and its use restrictions.",
                      )}
                    </label>
                  </div>
                </div>
              )}
            {native &&
              step === 5 &&
              (options.coverModel || options.portraitModel || (hasTurbo && options.turboModel)) &&
              !terms && (
                <p role="status">
                  {t(
                    "Accept the image model license to review your installation and continue.",
                  )}
                </p>
              )}

            {step === 0 && (
              <>
                {title(
                  "WELCOME TO ORIGAMI",
                  "Welcome to Origami.",
                  "Set up your reader, choose your voices, and create a space that feels right for you.",
                )}
                <div className="welcome-art">
                  <div className="art-fade" />
                  <div className="art-copy">
                    <span className="art-label">
                      <AudioLines size={15} /> {t("YOUR READING EXPERIENCE")}
                    </span>
                    <h2>{t("Your personal library")}</h2>
                    <p>{t("Books, documents and local voices.")}</p>
                  </div>
                  <img
                    className="hero-crane"
                    src="./crane.png"
                    alt={t("Origami paper crane")}
                  />
                  <div className="art-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div className="welcome-features">
                  <div>
                    <BookOpen />
                    <strong>{t("Books and documents")}</strong>
                    <p>{t("A thoughtful home for books and documents.")}</p>
                  </div>
                  <div>
                    <AudioLines />
                    <strong>{t("Local speech")}</strong>
                    <p>{t("Choose the languages and voices you want.")}</p>
                  </div>
                  <div>
                    <Sparkles />
                    <strong>{t("Appearance")}</strong>
                    <p>
                      {t("Set your theme, reading surface and atmosphere.")}
                    </p>
                  </div>
                </div>
                <div className="welcome-language">
                  <span>{t("Language")}</span>
                  <LanguagePicker
                    value={options.uiLanguage}
                    onChange={changeLanguage}
                  />
                  <small>
                    {t(
                      "Used by the installer and Origami Reader. You can change it any time in Settings.",
                    )}
                  </small>
                </div>
                <div className="privacy-card">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>{t("Offline and private")}</strong>
                    <p>
                      {t(
                        "Origami Reader works without an internet connection. No account, no ads, no tracking and no data collection. Your books, notes and voices stay on this computer.",
                      )}
                    </p>
                  </div>
                </div>
                <p className="quiet-note">
                  <Layers3 size={15} />{" "}
                  {t("You can change these preferences later in Origami.")}
                </p>
              </>
            )}
            {step === 1 && (
              <>
                {title(
                  "01 / INSTALLATION",
                  "Installation location",
                  "Decide where Origami lives and who can use it on this computer.",
                )}
                {system && (
                  <div className="system-card" role="status">
                    <Monitor size={18} />
                    <div>
                      <strong>{t("This computer")}</strong>
                      <p>
                        {[
                          platforms.find((x) => x.id === system.platform)?.name,
                          system.arch,
                          system.gpus.join(", ") || t("Graphics not detected"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <small>
                        {system.speech === "cuda"
                          ? t(
                              "Recommended speech engine: NVIDIA graphics (fastest).",
                            )
                          : system.speech === "rocm"
                            ? t(
                                "Recommended speech engine: AMD Radeon graphics (downloads AMD's runtime during setup).",
                              )
                          : system.speech === "mps"
                            ? t(
                                "Recommended speech engine: Apple silicon graphics.",
                              )
                            : t(
                                "Recommended speech engine: processor (CPU). Works everywhere; slower on long passages.",
                              )}
                      </small>
                      {system.speech === "rocm" && (
                        <label className="check-label amd-speech">
                          <input
                            type="checkbox"
                            checked={options.amdSpeech}
                            onChange={(e) =>
                              update("amdSpeech", e.target.checked)
                            }
                          />
                          {t(
                            "Use my AMD graphics card for speech. Setup downloads AMD's ROCm runtime from repo.radeon.com (about 3 GB, internet needed). Needs a recent AMD driver; if your card is not usable, speech uses the processor.",
                          )}
                        </label>
                      )}
                      {native && system.platform !== options.platform && (
                        <small className="warning-text">
                          {t(
                            "This package was built for another operating system. Download the version for this computer.",
                          )}
                        </small>
                      )}
                    </div>
                  </div>
                )}
                <div className="section-label">{t("INSTALL FOR")}</div>
                <div className="two-column">
                  <button
                    className={`choice ${options.scope === "user" ? "selected" : ""}`}
                    aria-pressed={options.scope === "user"}
                    onClick={() => changeScope("user")}
                  >
                    <span className="choice-top">
                      <strong>{t("Just me")}</strong>
                      <span className="radio-dot" />
                    </span>
                    <small>{t("Your personal installation.")}</small>
                    <em>{t("Recommended")}</em>
                  </button>
                  <button
                    className={`choice ${options.scope === "system" ? "selected" : ""}`}
                    aria-pressed={options.scope === "system"}
                    disabled={native}
                    onClick={() => changeScope("system")}
                  >
                    <span className="choice-top">
                      <strong>{t("Everyone on this computer")}</strong>
                      <span className="radio-dot" />
                    </span>
                    <small>
                      {native
                        ? t("Available in a later release.")
                        : t("May require administrator permission.")}
                    </small>
                  </button>
                </div>
                <label className="field-label" htmlFor="install-path">
                  {t("Installation location")}
                </label>
                <div className={`path-field ${error ? "invalid" : ""}`}>
                  <button
                    className="icon-button browse-folder"
                    aria-label={t("Choose installation folder")}
                    title={t("Choose installation folder")}
                    onClick={openFolder}
                  >
                    <Folder size={19} />
                  </button>
                  <input
                    id="install-path"
                    value={options.installPath}
                    onChange={(e) => update("installPath", e.target.value)}
                    spellCheck={false}
                    aria-invalid={!!error}
                    aria-describedby="path-note"
                  />
                  <button
                    className="icon-button"
                    aria-label={t("Restore default location")}
                    onClick={() =>
                      update(
                        "installPath",
                        defaultPath(options.platform, options.scope),
                      )
                    }
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                <p id="path-note" className={error ? "error" : "field-help"}>
                  {error ||
                    t(
                      "Choose a folder using the folder icon, or enter a location.",
                    )}
                </p>
                <div className="info-card">
                  <HardDrive size={22} />
                  <div>
                    <strong>{t("Storage, before you commit")}</strong>
                    <p>
                      {native && downloads
                        ? t(
                            "Setup downloads only what you choose, each part from its publisher and checked before use: about {value} GB with your current choices. Keep the computer online during setup.",
                            { value: (downloadBytes / 1e9).toFixed(1) },
                          )
                        : native
                        ? t(
                            "The full package contains {value} GB. Only selected components are installed. Free space and file integrity are checked during setup.",
                            { value: (packageSize / 1024 ** 3).toFixed(1) },
                          )
                        : t(
                            "The final installer will show sizes and available space.",
                          )}
                    </p>
                  </div>
                </div>
                <div className="section-label section-gap">
                  {t("COMPONENTS")}
                </div>
                <div className="component">
                  <BookOpen />
                  <div>
                    <strong>{t("Origami Reader")}</strong>
                    <small>{t("Library, reading, notes and bookmarks")}</small>
                  </div>
                  <span className="pill">{t("Included")}</span>
                </div>
                <div className="component future">
                  <Layers3 />
                  <div>
                    <strong>{t("Origami Studio")}</strong>
                    <small>
                      {t("Character casting and multi-voice storytelling")}
                    </small>
                  </div>
                  <span className="pill">{t("Coming later")}</span>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                {title(
                  "02 / LANGUAGE PACKS",
                  "Language packs",
                  "Keep your setup light, or bring more languages into your library. Every language pack is optional.",
                )}
                <Toggle
                  label={t("Set up local speech")}
                  detail={t(
                    "Prepare offline voice playback and its speech engine.",
                  )}
                  checked={options.speech}
                  onChange={(value) =>
                    setOptions((prev) => ({
                      ...prev,
                      speech: value,
                      languages: value
                        ? [
                            availableLanguages.find((item) => item.id === "en")
                              ?.id || availableLanguages[0]?.id,
                          ].filter((id): id is string => Boolean(id))
                        : [],
                    }))
                  }
                />
                {options.speech ? (
                  <>
                    <div className="language-tools">
                      <input
                        type="search"
                        aria-label={t("Find a language")}
                        placeholder={t("Find a language…")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <button
                        className="text-button"
                        onClick={() =>
                          update(
                            "languages",
                            availableLanguages.map((item) => item.id),
                          )
                        }
                      >
                        {t("Select all")}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => update("languages", [])}
                      >
                        {t("Clear")}
                      </button>
                    </div>
                    <div className="language-grid">
                      {availableLanguages
                        .filter((item) =>
                          `${item.name} ${item.native}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((item) => (
                          <label
                            className={`language-card ${options.languages.includes(item.id) ? "selected" : ""}`}
                            key={item.id}
                          >
                            <input
                              type="checkbox"
                              checked={options.languages.includes(item.id)}
                              onChange={() => toggleLanguage(item.id)}
                            />
                            <span className="language-glyph">{item.glyph}</span>
                            <span className="language-description">
                              <strong>{t(item.name)}</strong>
                              <small>
                                {item.native} ·{" "}
                                {t("{count} voice profiles", {
                                  count: item.count,
                                })}
                                {item.id === "hi"
                                  ? " · " + t("Experimental")
                                  : ""}
                              </small>
                            </span>
                            <span className="check-box" aria-hidden="true">
                              {options.languages.includes(item.id) && (
                                <Check size={13} />
                              )}
                            </span>
                          </label>
                        ))}
                    </div>
                    {!availableLanguages.some((item) =>
                      `${item.name} ${item.native}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    ) && (
                      <p className="empty-state">
                        {t("No matching language in this package.")}
                      </p>
                    )}
                    {options.languages.includes("hi") && (
                      <p className="quiet-note">
                        {t(
                          "Hindi voice references are included for future use. Playback is unavailable until a compatible speech engine is installed.",
                        )}
                      </p>
                    )}
                    <div className="selection-total">
                      <span>
                        {selected.length === 1
                          ? t("1 language pack selected")
                          : t("{count} language packs selected", {
                              count: selected.length,
                            })}
                      </span>
                      <strong>{t("{count} voices", { count: voices })}</strong>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <BookOpen size={30} />
                    <h3>{t("Start with reading.")}</h3>
                    <p>
                      {t("You can add voices and the speech engine later.")}
                    </p>
                  </div>
                )}
                <p className="quiet-note">
                  <CircleHelp size={15} />{" "}
                  {native
                    ? t("Includes {packagedVoices} voice profiles. ", {
                        packagedVoices: packagedVoices,
                      })
                    : t(
                        "Preview catalog of {packagedVoices} voice profiles. ",
                        { packagedVoices: packagedVoices },
                      )}
                  {native
                    ? t(
                        "Selected recordings and speech models are installed from this offline package.",
                      )
                    : t(
                        "Voice recordings and speech models are not included in this preview.",
                      )}
                </p>
              </>
            )}
            {step === 3 && (
              <>
                {title(
                  "03 / APPEARANCE",
                  "Starting appearance",
                  "Choose a complete background style. Plum Nocturne is the default.",
                )}
                <PresetPicker
                  options={options}
                  onSelect={(id) =>
                    setOptions((previous) => ({
                      ...previous,
                      ...presetOptions(id),
                    }))
                  }
                />
              </>
            )}
            {step === 4 && (
              <>
                {title(
                  "04 / PREFERENCES",
                  "Default preferences",
                  "Choose what to install and how Origami starts.",
                )}
                <div className="section-label">{t("MODELS TO INSTALL")}</div>
                <Toggle
                  label={t("Install book cover model")}
                  detail={t("Generate book covers locally. Optional download.")}
                  checked={options.coverModel}
                  onChange={(value) => update("coverModel", value)}
                />
                <Toggle
                  label={t("Install portrait model")}
                  detail={t(
                    "Generate character portraits locally. Optional download.",
                  )}
                  checked={options.portraitModel}
                  onChange={(value) => update("portraitModel", value)}
                />
                {hasLight && (
                  <Toggle
                    label={t("Install light voices")}
                    detail={t(
                      "Kitten Mini, Kitten Micro and Kokoro: 12 English voices that read quickly on any computer, no graphics card needed. About 0.8 GB.",
                    )}
                    checked={options.lightVoices}
                    onChange={(value) => update("lightVoices", value)}
                  />
                )}
                {hasTurbo && (
                  <Toggle
                    label={t("Install fast picture model")}
                    detail={t(
                      "SD-Turbo makes covers and portraits in seconds on modest computers. Powered by Stability AI. About 2.5 GB once installed.",
                    )}
                    checked={options.turboModel}
                    onChange={(value) => update("turboModel", value)}
                  />
                )}
                <div className="model-choice">
                  <label htmlFor="tts-model">{t("Text-to-speech model")}</label>
                  <select
                    id="tts-model"
                    value={options.speech ? options.speechModel : "none"}
                    disabled={!options.speech}
                    onChange={() => update("speechModel", "default")}
                  >
                    {!options.speech && (
                      <option value="none">
                        {t("Local speech is turned off")}
                      </option>
                    )}
                    <option value="default">{t("Qwen3-TTS 0.6B (natural voices)")}</option>
                  </select>
                  <p>
                    {options.speech
                      ? t(
                          "Installed with local speech and your selected voices. Light voices are a separate choice above.",
                        )
                      : t(
                          "Enable local speech in Language packs to install a TTS model.",
                        )}
                  </p>
                </div>
                <div className="section-label section-gap">
                  {t("COMFORT & ATMOSPHERE")}
                </div>
                <Toggle
                  label={t("Reduce motion")}
                  detail={t(
                    "Recommended for low-end computers or to save battery. Keeps backgrounds still and transitions minimal.",
                  )}
                  checked={reduced}
                  onChange={(value) =>
                    update("motion", value ? "reduced" : "system")
                  }
                />
                <div className="section-label section-gap">
                  {t("EVERYDAY CONVENIENCE")}
                </div>
                <Toggle
                  label={
                    options.platform === "windows"
                      ? t("Add to the Start menu")
                      : options.platform === "macos"
                        ? t("Keep in the Dock")
                        : t("Add to the applications menu")
                  }
                  detail={
                    options.platform === "windows"
                      ? t(
                          "Origami Reader appears in Start. Windows only lets you pin apps yourself: right-click it and choose Pin to Start.",
                        )
                      : options.platform === "macos"
                        ? t("Adds Origami Reader to the Dock.")
                        : t(
                            "Adds Origami Reader to your desktop environment's app launcher.",
                          )
                  }
                  checked={options.startMenu}
                  onChange={(value) => update("startMenu", value)}
                />
                <Toggle
                  label={t("Create a desktop shortcut")}
                  detail={t("Keep Origami within easy reach.")}
                  checked={options.shortcuts}
                  onChange={(value) => update("shortcuts", value)}
                />
                <Toggle
                  label={t("Check for updates")}
                  detail={t(
                    "Once a day, Origami tells you when a new version is available. Nothing is installed until you choose to.",
                  )}
                  checked={options.updates}
                  onChange={(value) => update("updates", value)}
                />
                <Toggle
                  label={t("Launch at {platformName} startup", {
                    platformName: platformName,
                  })}
                  detail={t(
                    "Start Origami automatically at {platformName} startup.",
                    { platformName: platformName },
                  )}
                  checked={options.startOnLogin}
                  onChange={(value) => update("startOnLogin", value)}
                />
              </>
            )}
            {step === 5 &&
              (!native ||
                !(options.coverModel || options.portraitModel || (hasTurbo && options.turboModel)) ||
                terms) && (
                <>
                  {title(
                    "05 / REVIEW",
                    "Review your setup",
                    native
                      ? "Review your choices before installing Origami."
                      : "Review your choices before previewing the installation experience.",
                  )}
                  <div className="review-banner">
                    <img src="./crane.png" alt="" />
                    <div>
                      <strong>{t("Origami Reader")}</strong>
                      <small>
                        {
                          platforms.find((item) => item.id === options.platform)
                            ?.name
                        }{" "}
                        ·{" "}
                        {options.scope === "user"
                          ? t("Personal installation")
                          : t("Shared installation")}
                      </small>
                    </div>
                    <span className="pill">
                      {native ? (downloads ? t("Online setup") : t("Offline package")) : t("Setup preview")}
                    </span>
                  </div>
                  <div className="summary">
                    {summaryRow("Destination", options.installPath, 1)}
                    {summaryRow(
                      "Components",
                      options.speech ? t("Reader + local speech") : t("Reader"),
                      2,
                    )}
                    {summaryRow(
                      "Language packs",
                      selected.length
                        ? t("{languages} ({voices} voices)", {
                            languages: selected
                              .map((item) => t(item.name))
                              .join(", "),
                            voices,
                          })
                        : "None selected",
                      2,
                    )}
                    {summaryRow("Starting style", t(preset.name), 3)}
                    {summaryRow(
                      "Models",
                      selectedModels.map((m) => t(m)).join(", ") ||
                        "None selected",
                      4,
                    )}
                    {downloads &&
                      summaryRow(
                        "Download",
                        t("About {value} GB from the publishers", { value: (downloadBytes / 1e9).toFixed(1) }),
                        4,
                      )}
                    {summaryRow(
                      "Reading",
                      [
                        t(surfaceNames[options.readingSurface]),
                        options.textSize === "large"
                          ? t("Large text")
                          : t("Standard text"),
                        options.paperTexture
                          ? t("Paper texture")
                          : t("No texture"),
                      ].join(" · "),
                      3,
                    )}
                    {summaryRow(
                      "Atmosphere",
                      `${t(preset.name)} · ${reduced ? t("reduced motion") : t("system motion preference")}`,
                      4,
                    )}
                    {summaryRow(
                      "Convenience",
                      [
                        options.startMenu &&
                          (options.platform === "windows"
                            ? t("Start menu")
                            : options.platform === "macos"
                              ? t("Dock")
                              : t("Applications menu")),
                        options.shortcuts && t("Desktop shortcut"),
                        options.updates && t("Update notifications"),
                        options.startOnLogin &&
                          t("Launch at {platformName} startup", {
                            platformName: platformName,
                          }),
                      ]
                        .filter(Boolean)
                        .join(", ") || t("No extras"),
                      4,
                    )}
                  </div>
                  <div className="info-card">
                    <CircleHelp size={21} />
                    <div>
                      <strong>
                        {native ? t("Ready to install") : t("Ready to preview")}
                      </strong>
                      <p>
                        {native
                          ? t(
                              "Install your selected components from this package. Speech chooses NVIDIA acceleration when available and CPU otherwise. CPU speech can be slow.",
                            )
                          : t(
                              "This demonstration simulates progress without installing files.",
                            )}
                      </p>
                    </div>
                  </div>
                </>
              )}
            {step === 6 && (
              <>
                {title(
                  native ? "INSTALLING ORIGAMI" : "INSTALLATION PREVIEW",
                  "Preparing your Origami setup.",
                  native
                    ? "Copying and checking your selected app, voices and models."
                    : "Preview the installation stages and progress animation. No files are being installed.",
                )}
                <div className="progress-art">
                  <img src="./crane.png" alt="" />
                  <div className="progress-orbit" />
                  <div className="progress-orbit second" />
                </div>
                <div className="progress-heading">
                  <span>
                    {native
                      ? paused
                        ? t("Installation paused")
                        : t(installMessage)
                      : paused
                        ? t("Preview paused")
                        : phase === 2 && !selected.length
                          ? t("Skipping optional language packs")
                          : phase === 3 && !selectedModels.length
                            ? t("Skipping optional models")
                            : t(phases[phase])}
                  </span>
                  <strong>
                    {Math.floor(progress)}
                    <small>%</small>
                  </strong>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={
                    native
                      ? "Installation progress"
                      : "Simulated installation progress"
                  }
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.floor(progress)}
                >
                  <div style={{ width: `${progress}%` }} />
                </div>
                <div className="progress-meta">
                  <span>
                    {t("{packs} language packs · {voices} voice profiles", {
                      packs: selected.length,
                      voices,
                    })}
                  </span>
                  <span>
                    {native
                      ? t("COPYING AND VERIFYING FILES")
                      : t("SIMULATED PROGRESS")}
                  </span>
                </div>
                <ol className="phase-list" hidden={native}>
                  {phases.map((name, index) => (
                    <li
                      className={
                        index < phase
                          ? "done"
                          : index === phase
                            ? "current"
                            : ""
                      }
                      key={name}
                    >
                      <span>
                        {index < phase ? <Check size={13} /> : index + 1}
                      </span>
                      {index === 2 && !selected.length
                        ? t("Skipping optional language packs")
                        : index === 3 && !selectedModels.length
                          ? t("Skipping optional models")
                          : t(name)}
                      {index < phase && <small>{t("Complete")}</small>}
                      {index === phase && (
                        <small>{paused ? t("Paused") : t("In progress")}</small>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
            {step === 7 && (
              <>
                <div className="complete-mark">
                  <Check size={33} />
                </div>
                {title(
                  native ? "INSTALLATION COMPLETE" : "PREVIEW COMPLETE",
                  "Setup complete",
                  native
                    ? "Origami and your selected voices and models are installed."
                    : "This preview has finished. App installation and launch will be connected with the release packages.",
                )}
                <div className="completion-details">
                  <div>
                    <Globe2 />
                    <strong>{selected.length}</strong>
                    <small>{t("Language packs")}</small>
                  </div>
                  <div>
                    <AudioLines />
                    <strong>{voices}</strong>
                    <small>{t("Voice profiles")}</small>
                  </div>
                  <div>
                    <Sparkles />
                    <strong>{t(preset.name)}</strong>
                    <small>{t("Starting style")}</small>
                  </div>
                </div>
                <button
                  className="primary completion-launch"
                  onClick={() => finish("launch")}
                >
                  <Play size={17} /> {t("Close Installer and Launch Origami")}
                </button>
                <button
                  className="text-button close-installer-link"
                  onClick={() => finish("close")}
                >
                  {t("Close installer only")}
                </button>
                {warnings.map((warning) => (
                  <p className="finish-message" key={warning}>
                    {warning}
                  </p>
                ))}
                {finishedAction && (
                  <p className="finish-message" role="status">
                    {finishedAction === "launch"
                      ? t(
                          "Launch is not connected in this preview. No app was installed. You can close this tab.",
                        )
                      : t(
                          "The preview is finished. You can close this browser tab.",
                        )}
                  </p>
                )}
              </>
            )}
          </div>
          <footer>
            <span className="footer-context">
              {step < 6
                ? `${String(step + 1).padStart(2, "0")} / 06`
                : t("ORIGAMI SETUP")}
              <span>
                {step < 6
                  ? t("Personalize your installation")
                  : native
                    ? t("Origami setup")
                    : t("Interface preview")}
              </span>
            </span>
            <div className="footer-actions">
              {step > 0 && step < 6 && (
                <button className="secondary" onClick={() => setStep(step - 1)}>
                  <ArrowLeft size={16} /> {t("Back")}
                </button>
              )}
              {step < 6 && (
                <button
                  className="primary"
                  disabled={
                    !packageReady ||
                    (step > 0 && !!error) ||
                    (native &&
                      step === 5 &&
                      (options.coverModel || options.portraitModel || (hasTurbo && options.turboModel)) &&
                      !terms) ||
                    (native && step === 5 && !appTerms)
                  }
                  onClick={() =>
                    step === 5 ? startPreview() : setStep(step + 1)
                  }
                >
                  {step === 0
                    ? t("Get started")
                    : step === 5
                      ? native
                        ? t("Install Origami")
                        : t("Preview installation")
                      : t("Continue")}
                  <ArrowRight size={16} />
                </button>
              )}
              {step === 6 && (
                <>
                  <button
                    className="text-button"
                    onClick={() => setCancel(true)}
                  >
                    {native ? t("Cancel installation") : t("Cancel preview")}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (native)
                        void invoke("control_install", {
                          action: paused ? "resume" : "pause",
                        });
                      setPaused((value) => !value);
                    }}
                  >
                    {paused ? <Play size={15} /> : <Pause size={15} />}
                    {paused ? t("Resume") : t("Pause")}
                  </button>
                </>
              )}
            </div>
          </footer>
        </main>
      </div>
      <div className="outside-caption">
        <span>{t("ORIGAMI")}</span>
        <span>
          {native
            ? downloads
              ? t("Origami Reader · Online beta setup")
              : t("Origami Reader · Offline beta package")
            : t("Installer design preview · No application payload")}
        </span>
        <button
          onClick={() => update("motion", reduced ? "system" : "reduced")}
          aria-label={
            reduced
              ? "Use system motion preference"
              : "Reduce background motion"
          }
        >
          {reduced ? <Sun size={13} /> : <Moon size={13} />}
          {reduced ? t("Still") : t("Ambient")}
        </button>
      </div>
      <dialog
        ref={folderDialog}
        className="folder-dialog"
        aria-labelledby="folder-dialog-title"
        onCancel={(event) => {
          if (folderBusy) event.preventDefault();
          else setFolderOpen(false);
        }}
        onClose={() => setFolderOpen(false)}
      >
        <div className="eyebrow">{t("INSTALLATION LOCATION")}</div>
        <h2 id="folder-dialog-title">{t("Choose a folder")}</h2>
        <p>
          {t(
            "Choose a parent folder. Origami will use its own folder inside it.",
          )}
        </p>
        <button
          className="secondary native-browse"
          disabled={folderBusy}
          onClick={browseFolder}
        >
          <Folder size={18} />
          {folderBusy
            ? t("Folder chooser is open…")
            : t("Browse this computer")}
        </button>
        <label className="field-label" htmlFor="folder-draft">
          {t("Install Origami in")}
        </label>
        <input
          id="folder-draft"
          value={folderDraft}
          disabled={folderBusy}
          onChange={(event) => setFolderDraft(event.target.value)}
          aria-invalid={!!folderError}
          aria-describedby="folder-message"
          spellCheck={false}
        />
        <p
          id="folder-message"
          className={folderError ? "error" : "field-help"}
          role="status"
        >
          {folderError ||
            folderMessage ||
            t("You can also type the full installation path.")}
        </p>
        <div className="dialog-actions">
          <button
            className="secondary"
            disabled={folderBusy}
            onClick={() => setFolderOpen(false)}
          >
            {t("Cancel")}
          </button>
          <button
            className="primary"
            disabled={folderBusy || !!folderError}
            onClick={() => {
              update("installPath", folderDraft.trim());
              setFolderOpen(false);
            }}
          >
            {t("Use this folder")}
          </button>
        </div>
      </dialog>
      <dialog
        ref={helpDialog}
        onCancel={() => setHelp(false)}
        onClose={() => setHelp(false)}
      >
        <button
          className="dialog-close icon-button"
          aria-label={t("Close preview information")}
          onClick={() => setHelp(false)}
        >
          <X size={18} />
        </button>
        <div className="eyebrow">
          {native ? t("ORIGAMI SETUP") : t("ABOUT THIS PREVIEW")}
        </div>
        <h2>
          {native ? t("About this beta") : t("About the installer preview")}
        </h2>
        <p>
          {native
            ? t(
                "The package detects your operating system. Use the build made for your platform.",
              )
            : t("Explore setup screens for Windows, macOS and Linux.")}
        </p>
        <p>
          {native
            ? t(
                "Includes Origami Reader, {packagedVoices} voices, Qwen speech and optional DreamShaper image generation. This beta supports fresh per-user installations. Updates and Studio are not implemented yet.",
                { packagedVoices: packagedVoices },
              )
            : t("This preview contains no application payload.")}
        </p>
        <button className="primary" onClick={() => setHelp(false)}>
          {t("Got it")}
        </button>
      </dialog>
      <dialog
        ref={cancelDialog}
        onCancel={() => setCancel(false)}
        onClose={() => setCancel(false)}
      >
        <div className="eyebrow">
          {native ? t("CANCEL INSTALLATION") : t("CANCEL PREVIEW")}
        </div>
        <h2>{t("Return to your choices?")}</h2>
        <p>
          {native
            ? t(
                "Setup will remove its incomplete files. Your selections will be kept so you can try again.",
              )
            : t(
                "Your selections will be kept. You can start the progress preview again at any time.",
              )}
        </p>
        <div className="dialog-actions">
          <button className="secondary" onClick={() => setCancel(false)}>
            {native ? t("Continue installing") : t("Keep previewing")}
          </button>
          <button
            className="primary"
            onClick={() => {
              setCancel(false);
              if (native) {
                void invoke("control_install", { action: "cancel" });
                return;
              }
              setProgress(0);
              setStep(5);
            }}
          >
            {t("Return to review")}
          </button>
        </div>
      </dialog>
    </div>
  );
}
