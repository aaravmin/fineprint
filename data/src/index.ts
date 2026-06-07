// Fineprint data layer: NYC public datasets in, engine-ready facts out.
// All lookups are keyed by BBL; lookupBuilding chains the whole pipeline.

export * from "./types.ts";
export { lookupBbl, lookupBblCandidates } from "./geosearch.ts";
export { fetchLl84 } from "./ll84.ts";
export { fetchArticle321Flag, getCblEntry, isLl97Covered } from "./coveredBuildings.ts";
export { lookupBuilding } from "./lookup.ts";
export { dataToolDefinitions, executeDataTool } from "./tools.ts";
export { toEngineInput, type EngineInputResult } from "./engineBridge.ts";
export { planRetrofit, type RetrofitPlan, type MeasureExclusion } from "./retrofit.ts";
export {
  buildCompliancePlan,
  explainFineData,
  explainLookupError,
  type CompliancePlan,
  type FineDataExplanation,
  type FineDataStatus,
  type LawSummary,
  type PrioritizedAction,
  type ActionLawLink,
  type ObligationDisposition,
  type PlanMeasure,
  type Handling,
} from "./compliancePlan.ts";
export {
  ll84FilingStatus,
  ll87FilingStatus,
  ll88FilingStatus,
  ll11FilingStatus,
  ll152FilingStatus,
  type FilingStatus,
} from "./filings.ts";
export {
  assessObligations,
  LAW_ANALYZERS,
  type LawAnalyzer,
  type Obligation,
  type ObligationAssessment,
  type ProceduralObligation,
  type PerformanceObligation,
  type ComplianceStatus,
} from "./obligations.ts";
export { prepareIntake, type IntakeDeps, type IntakeResult } from "./intake.ts";
export * from "../laws.ts";
