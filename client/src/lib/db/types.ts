// Row shapes the dashboard consumes. The database speaks snake_case with
// timestamptz strings; the mappers in mappers.ts convert every row to these
// camelCase shapes with real Date fields and `undefined` for absent values,
// which is the vocabulary the components have always used.

export interface Building {
  id: number;
  owner: string;
  address: string;
  bbl: string | undefined;
  bin: string | undefined;
  sqft: number;
  isAffordable: boolean;
  annualEmissionsTco2e: number | undefined;
  usesJson: string | undefined;
  ll97Covered: boolean | undefined;
  provenanceJson: string | undefined;
  numFloors: number | undefined;
  unitsResidential: number | undefined;
  communityDistrict: number | undefined;
  energyStarScore: number | undefined;
  compliancePlanJson: string | undefined;
  createdAt: Date;
}

export interface Task {
  id: number;
  owner: string;
  buildingId: number | undefined;
  lawId: string;
  kind: string;
  title: string;
  status: string;
  deadline: Date;
  slaBreached: boolean;
  fineEstimateUsd: number | undefined;
  claimedBy: number | undefined;
  intakeAddress: string | undefined;
  createdAt: Date;
}

export interface Worker {
  id: number;
  name: string;
  status: string;
  lastHeartbeat: Date;
  currentTaskId: number | undefined;
}

export interface Submission {
  id: number;
  owner: string;
  taskId: number;
  workerId: number;
  body: string;
  payloadJson: string | undefined;
  submittedAt: Date;
}

export interface Approval {
  id: number;
  owner: string;
  taskId: number;
  approvedBy: string;
  verdict: string;
  note: string;
  at: Date;
}

export interface Settings {
  owner: string;
  reviewMode: string;
}

export interface Event {
  id: number;
  owner: string;
  kind: string;
  taskId: number | undefined;
  workerId: number | undefined;
  payload: string;
  at: Date;
}

export interface Vendor {
  id: number;
  owner: string;
  name: string;
  company: string;
  roleType: string;
  email: string;
  phone: string;
  licenseNumber: string;
  licenseType: string;
  notes: string;
  createdAt: Date;
}

export interface Obligation {
  id: number;
  owner: string;
  buildingId: number;
  lawId: string;
  title: string;
  status: string;
  dueDate: Date | undefined;
  responsibleParty: string;
  vendorId: number | undefined;
  filingReferenceNumber: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | undefined;
}

export interface Evidence {
  id: number;
  owner: string;
  obligationId: number;
  buildingId: number;
  lawId: string;
  fileName: string;
  fileType: string;
  fileUrlOrKey: string;
  uploadedBy: string;
  uploadedAt: Date;
  documentDate: Date | undefined;
  expirationDate: Date | undefined;
  issuer: string;
  vendorId: number | undefined;
  filingReferenceNumber: string;
  verificationStatus: string;
  notes: string;
}

export interface BinderEvent {
  id: number;
  owner: string;
  buildingId: number;
  obligationId: number | undefined;
  lawId: string;
  kind: string;
  summary: string;
  at: Date;
}
