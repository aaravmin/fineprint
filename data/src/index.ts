// Fineprint data layer: NYC public datasets in, engine-ready facts out.
// All lookups are keyed by BBL; lookupBuilding chains the whole pipeline.

export * from "./types.ts";
export { lookupBbl, lookupBblCandidates } from "./geosearch.ts";
export { fetchLl84 } from "./ll84.ts";
export { fetchArticle321Flag, getCblEntry, isLl97Covered } from "./coveredBuildings.ts";
export { lookupBuilding, emptyPublicRecords, type LookupSources } from "./lookup.ts";
export { assessBuildingSystems } from "./buildingSystems.ts";
export {
  assessSystemDeadlines,
  type SystemDeadline,
  type SystemDeadlineKind,
  type SystemDeadlineStatus,
} from "./systemDeadlines.ts";
export { applyUserOverrides, type OverrideValue, type SystemOverride, type UserOverrides } from "./overrides.ts";
export { dataToolDefinitions, executeDataTool } from "./tools.ts";
export { toEngineInput, type EngineInputResult } from "./engineBridge.ts";
export { planRetrofit, type RetrofitPlan, type MeasureExclusion } from "./retrofit.ts";
export {
  personalizeMeasures,
  measureSatisfiesLaws,
  PERSONALIZED_CATALOG,
  type PersonalizedMeasure,
  type CatalogEntry,
} from "./personalizedMeasures.ts";
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
  assessObligations,
  LAW_ANALYZERS,
  type LawAnalyzer,
  type Obligation,
  type ObligationAssessment,
  type ProceduralObligation,
  type PerformanceObligation,
  type ComplianceStatus,
} from "./obligations.ts";
export {
  categorizeBuilding,
  type BuildingCategory,
  type BroadCategory,
  type PlaceLookup,
  type FetchPlace,
  type CategorizeDeps,
} from "./category.ts";
export { prepareIntake, type IntakeDeps, type IntakeResult } from "./intake.ts";
export * from "../laws.ts";
