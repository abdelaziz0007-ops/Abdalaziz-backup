import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRepository, fixtures, type MockRepository } from "@/data/repository";
import { makePeriod, periodKey, type LocalDatasets, type PeriodDataset } from '@/data/analytics';
import { calculateFinance, classifications } from '@/data/finance';
import type { AccountingPeriod } from '@/data/types';
import type {
  ErrorMode,
  LatencyPreset,
  Persona,
  PersonaId,
  ScenarioId,
} from "@/data/types";

/**
 * Demo + workspace state. This is PROTOTYPE CHROME, not production configuration.
 * - persona / scenario / latency / error mode drive the mock repository.
 * - selectedEntityId / selectedPeriodId are workspace selections; changing entity
 *   clears any selection that does not belong to the new entity.
 * - Persisted locally: demo preferences and workflow selections only.
 *   NEVER credentials, tokens, or uploaded file contents.
 */
const STORAGE_KEY = "fw.demo.workspace.v1";

export const SCENARIO_IDS: ScenarioId[] = [
  "baseline",
  "partialAllocation",
  "blockedQuality",
  "staleReviewVersion",
  "unexplainedDifference250",
  "lockedReconciliation",
  "quotaReached",
  "providerUnavailable",
  "emptyEntity",
];

export const PERSONA_IDS: PersonaId[] = ["maya", "omar", "lina", "noor"];

interface PersistedState {
  personaId: PersonaId;
  scenario: ScenarioId;
  latency: LatencyPreset;
  errorMode: ErrorMode;
  selectedEntityId: string | null;
  selectedPeriodId: string | null;
}

interface DemoContextValue extends PersistedState {
  localDatasets: LocalDatasets;
  availablePeriods: AccountingPeriod[];
  publishDatasets: (datasets: Omit<PeriodDataset,'revision'|'importedAt'>[]) => void;
  repo: MockRepository;
  currentPersona: Persona | null;
  repoGeneration: number;
  setPersonaId: (id: PersonaId) => void;
  setScenario: (s: ScenarioId) => void;
  setLatency: (l: LatencyPreset) => void;
  setErrorMode: (e: ErrorMode) => void;
  selectEntity: (entityId: string) => void;
  selectPeriod: (periodId: string) => void;
  resetDemo: () => void;
}

const DEFAULTS: PersistedState = {
  personaId: "maya",
  scenario: "baseline",
  latency: "fast",
  errorMode: "none",
  selectedEntityId: null,
  selectedPeriodId: null,
};

const DemoContext = createContext<DemoContextValue | null>(null);

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      personaId: PERSONA_IDS.includes(parsed.personaId as PersonaId) ? (parsed.personaId as PersonaId) : DEFAULTS.personaId,
      scenario: SCENARIO_IDS.includes(parsed.scenario as ScenarioId) ? (parsed.scenario as ScenarioId) : DEFAULTS.scenario,
      latency: parsed.latency === "none" || parsed.latency === "slow" || parsed.latency === "fast" ? parsed.latency : DEFAULTS.latency,
      errorMode: parsed.errorMode === "random" || parsed.errorMode === "provider" ? parsed.errorMode : DEFAULTS.errorMode,
      selectedEntityId: typeof parsed.selectedEntityId === "string" ? parsed.selectedEntityId : null,
      selectedPeriodId: typeof parsed.selectedPeriodId === "string" ? parsed.selectedPeriodId : null,
    };
  } catch {
    return DEFAULTS;
  }
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState);
  const [repoGeneration, setRepoGeneration] = useState(0);
  const [datasetStore,setDatasetStore] = useState<Record<string,LocalDatasets>>({});
  const localDatasets=useMemo(()=>datasetStore[state.scenario]??{},[datasetStore,state.scenario]);
  const availablePeriods=useMemo(()=>[...fixtures.periods.filter(p=>!localDatasets[p.id]),...Object.values(localDatasets).map(makePeriod)].sort((a,b)=>a.startDate.localeCompare(b.startDate)),[localDatasets]);

  // The persona record itself is static fixture data (no async needed);
  // everything else flows through the mock repository.
  const currentPersona = useMemo<Persona | null>(
    () => fixtures.personas.find((p) => p.id === state.personaId) ?? null,
    [state.personaId],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state]);

  const repo = useMemo(
    () =>
      createRepository({
        scenario: state.scenario,
        latency: state.latency,
        errorMode: state.errorMode,
        personaId: state.personaId,
        localDatasets,
        activePeriodId: state.selectedPeriodId,
      }),
    // repoGeneration forces a fresh instance after reset so in-flight results
    // from the previous demo state are ignored by consumers.
    [state.scenario, state.latency, state.errorMode, state.personaId, repoGeneration, localDatasets, state.selectedPeriodId],
  );

  /** Changing entity clears period/bank/report selections tied to the old entity. */
  const selectEntity = useCallback((entityId: string) => {
    setState((s) => (s.selectedEntityId === entityId ? s : { ...s, selectedEntityId: entityId, selectedPeriodId: null }));
  }, []);

  const selectPeriod = useCallback((periodId: string) => {
    setState((s) => (s.selectedPeriodId === periodId ? s : { ...s, selectedPeriodId: periodId }));
  }, []);

  const setPersonaId = useCallback((personaId: PersonaId) => {
    // Persona change re-scopes the workspace: drop entity selection so an
    // unauthorized entity is never kept visible (FR-002 mock demonstration).
    setState((s) => (s.personaId === personaId ? s : { ...s, personaId, selectedEntityId: null, selectedPeriodId: null }));
  }, []);

  const setScenario = useCallback((scenario: ScenarioId) => {
    setState((s) => (s.scenario === scenario ? s : { ...s, scenario }));
  }, []);

  const setLatency = useCallback((latency: LatencyPreset) => setState((s) => ({ ...s, latency })), []);
  const setErrorMode = useCallback((errorMode: ErrorMode) => setState((s) => ({ ...s, errorMode })), []);
  const publishDatasets=useCallback((datasets:Omit<PeriodDataset,'revision'|'importedAt'>[])=>{
    if(!currentPersona?.permissions.includes('imports.manage'))throw new Error('Import permission required');
    for(const dataset of datasets){
      if(!currentPersona.scopedEntityIds.includes(dataset.entityId))throw new Error('Entity scope denied');
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(dataset.period)||!dataset.rows.length||dataset.rows.some(r=>!classifications.includes(r.classification)))throw new Error('Invalid period or account classification');
      if(calculateFinance(dataset.rows).trialResidual!=='0.00')throw new Error('Unbalanced trial balance: '+dataset.period);
    }
    setDatasetStore(store=>{const scope={...(store[state.scenario]??{})};for(const dataset of datasets){const key=periodKey(dataset.entityId,dataset.period);scope[key]={...structuredClone(dataset),revision:(scope[key]?.revision??3)+1,importedAt:new Date().toISOString()};}return {...store,[state.scenario]:scope};});
  },[currentPersona,state.scenario]);

  const resetDemo = useCallback(() => {
    // Reset restores demo state only. Local preferences (locale/theme/density)
    // live in PreferencesProvider and are intentionally untouched here.
    setState({ ...DEFAULTS, latency: state.latency });
    setRepoGeneration((g) => g + 1);
    setDatasetStore({});
  }, [state.latency]);

  // If the persona can no longer see the selected entity, clear it defensively.
  const personaRef = useRef(currentPersona);
  personaRef.current = currentPersona;
  useEffect(() => {
    const persona = personaRef.current;
    if (state.selectedEntityId && (!persona || !persona.scopedEntityIds.includes(state.selectedEntityId))) {
      setState((s) => ({ ...s, selectedEntityId: null, selectedPeriodId: null }));
    }
  }, [state.selectedEntityId, currentPersona]);

  const value = useMemo<DemoContextValue>(
    () => ({
      ...state,
      repo,
      currentPersona,
      repoGeneration,
      localDatasets, availablePeriods, publishDatasets,
      setPersonaId,
      setScenario,
      setLatency,
      setErrorMode,
      selectEntity,
      selectPeriod,
      resetDemo,
    }),
    [state, repo, currentPersona, repoGeneration, setPersonaId, setScenario, setLatency, setErrorMode, selectEntity, selectPeriod, resetDemo, localDatasets, availablePeriods, publishDatasets],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
