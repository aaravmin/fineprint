"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { Building2, CircleDollarSign, ListTodo, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useReducer, useTable } from "spacetimedb/react";

import { AddressAutocomplete } from "@/components/address-autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyFolder } from "@/components/ui/empty-folder";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computePeriods, fmtUsd } from "@/lib/engine";
import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import { withAck } from "@/lib/reducer-call";
import { reducers, tables } from "@/module_bindings/index";
import type { Building, Task } from "@/module_bindings/types";

type LawScope =
  | "all"
  | "ll97"
  | "art321"
  | "ll84"
  | "ll87"
  | "ll11"
  | "ll88"
  | "ll152"
  | "ll55";

interface LawOption {
  id: LawScope;
  label: string;
  taskLawIds: readonly string[];
}

interface FineBasis {
  id: string;
  lawId: LawScope;
  label: string;
  type: string;
  value: string;
  unit: string;
  detail: string;
}

const LAW_OPTIONS: LawOption[] = [
  { id: "all", label: "All laws", taskLawIds: [] },
  { id: "ll97", label: "Local Law 97", taskLawIds: ["ll97", "art321"] },
  { id: "art321", label: "Article 321", taskLawIds: ["art321"] },
  { id: "ll84", label: "Local Law 84", taskLawIds: ["ll84"] },
  { id: "ll87", label: "Local Law 87", taskLawIds: ["ll87"] },
  { id: "ll11", label: "Local Law 11", taskLawIds: ["ll11"] },
  { id: "ll88", label: "Local Law 88", taskLawIds: ["ll88"] },
  { id: "ll152", label: "Local Law 152", taskLawIds: ["ll152"] },
  { id: "ll55", label: "Local Law 55", taskLawIds: ["ll55"] },
];

const FINE_BASES: FineBasis[] = [
  {
    id: "ll97-standard",
    lawId: "ll97",
    label: "LL97 standard",
    type: "Fine rate",
    value: "$268",
    unit: "/ton",
    detail: "Applies when a covered building exceeds its annual emissions limit.",
  },
  {
    id: "ll97-article-321",
    lawId: "art321",
    label: "Article 321",
    type: "Fine type",
    value: "$10,000",
    unit: "flat penalties",
    detail:
      "Affordable-housing pathway: comply through prescribed measures or the 2030 target.",
  },
  {
    id: "ll84-benchmarking",
    lawId: "ll84",
    label: "LL84 benchmarking",
    type: "Fine type",
    value: "$500",
    unit: "/quarter",
    detail:
      "Annual energy and water benchmarking; repeated quarterly violations are tracked as annual exposure.",
  },
  {
    id: "ll87-audit",
    lawId: "ll87",
    label: "LL87 audit",
    type: "Fine type",
    value: "$3,000",
    unit: "estimated filing exposure",
    detail:
      "Energy audit and retro-commissioning cycle exposure is tracked from task metadata.",
  },
  {
    id: "ll11-fisp",
    lawId: "ll11",
    label: "LL11 / FISP",
    type: "Fine type",
    value: "$5,000",
    unit: "estimated annualized exposure",
    detail:
      "Facade inspection exposure is task-backed until DOB cycle-window data is fully wired.",
  },
  {
    id: "ll88-lighting",
    lawId: "ll88",
    label: "LL88 lighting",
    type: "Fine type",
    value: "Filing + upgrade",
    unit: "lighting and tenant submetering evidence",
    detail:
      "No per-ton rate is modeled; the dashboard tracks the upgrade/report obligation.",
  },
  {
    id: "ll152-gas",
    lawId: "ll152",
    label: "LL152 gas piping",
    type: "Fine type",
    value: "$10,000",
    unit: "failure-to-certify exposure",
    detail: "Gas-piping certification exposure is tracked per building task.",
  },
  {
    id: "ll55-allergens",
    lawId: "ll55",
    label: "LL55 allergens",
    type: "Fine type",
    value: "Variable",
    unit: "HPD violation classes",
    detail:
      "Mold and pest penalties vary too widely to model honestly, so Fineprint tracks the obligation without a fake rate.",
  },
];

const RECENT_ADDRESSES_KEY = "fineprint:recent-addresses";
const RECENT_LIMIT = 6;

function ll97Fine(building: Building, periodIndex: number): number | null {
  const periods = computePeriods(building);
  return periods?.[periodIndex]?.annualFineUsd ?? null;
}

function openTaskCount(buildingId: bigint, tasks: readonly Task[]): number {
  return tasks.filter(t => t.buildingId === buildingId && t.status === "open").length;
}

function lawMatches(task: Task, lawScope: LawScope): boolean {
  if (lawScope === "all") return true;
  const option = LAW_OPTIONS.find(law => law.id === lawScope);
  return option?.taskLawIds.includes(task.lawId) ?? false;
}

function taskExposure(tasks: readonly Task[]): number {
  return tasks.reduce((sum, task) => sum + (task.fineEstimateUsd ?? 0), 0);
}

function readRecentAddresses(): string[] {
  const raw = getLocalStorageValue(RECENT_ADDRESSES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberAddress(address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return readRecentAddresses();
  const next = [
    trimmed,
    ...readRecentAddresses().filter(item => item.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, RECENT_LIMIT);
  setLocalStorageValue(RECENT_ADDRESSES_KEY, JSON.stringify(next));
  return next;
}

export function PortfolioClient() {
  const [buildings] = useTable(tables.building);
  const [tasks] = useTable(tables.task);
  const router = useRouter();
  const requestBuilding = useReducer(reducers.requestBuilding);
  const [address, setAddress] = useState("");
  const [lawScope, setLawScope] = useState<LawScope>("all");
  const [fineBasisId, setFineBasisId] = useState(FINE_BASES[0].id);
  const [recentAddresses, setRecentAddresses] = useState<string[]>([]);
  const requestedQueryAddress = useRef<string | null>(null);

  useEffect(() => {
    setRecentAddresses(readRecentAddresses());
  }, []);

  useEffect(() => {
    const visibleBases = FINE_BASES.filter(basis => {
      if (lawScope === "all") return true;
      if (lawScope === "ll97") return basis.lawId === "ll97" || basis.lawId === "art321";
      return basis.lawId === lawScope;
    });
    if (!visibleBases.some(basis => basis.id === fineBasisId)) {
      setFineBasisId(visibleBases[0]?.id ?? FINE_BASES[0].id);
    }
  }, [fineBasisId, lawScope]);

  const submitAddress = useCallback(
    (nextAddress = address) => {
      const trimmed = nextAddress.trim();
      if (!trimmed) {
        toast.error("Enter a street address with the borough");
        return;
      }

      // Optimistic: confirm immediately, surface a failure if the ack comes
      // back negative. The reducer is the source of truth either way.
      setRecentAddresses(rememberAddress(trimmed));
      setAddress("");
      toast.success("Intake queued. An agent is pulling the city's records now");
      withAck(requestBuilding({ address: trimmed }), `Intake for "${trimmed}"`).catch(
        (error: Error) => {
          toast.error(`Intake for "${trimmed}" failed: ${error.message}`);
        },
      );
    },
    [address, requestBuilding],
  );

  useEffect(() => {
    const queryAddress = new URLSearchParams(window.location.search)
      .get("address")
      ?.trim();
    if (!queryAddress || requestedQueryAddress.current === queryAddress) return;

    requestedQueryAddress.current = queryAddress;
    setAddress(queryAddress);
    submitAddress(queryAddress);
  }, [submitAddress]);

  const visibleTasks = tasks.filter(task => lawMatches(task, lawScope));
  const visibleOpenTasks = visibleTasks.filter(t => t.status === "open");
  const visibleTaskExposure = taskExposure(visibleTasks);
  const totalCurrent =
    lawScope === "ll97"
      ? buildings.reduce((sum, b) => sum + (ll97Fine(b, 0) ?? 0), 0)
      : 0;
  const total2030 =
    lawScope === "ll97"
      ? buildings.reduce((sum, b) => sum + (ll97Fine(b, 1) ?? 0), 0)
      : 0;
  const activeFineBasis =
    FINE_BASES.find(basis => basis.id === fineBasisId) ?? FINE_BASES[0];
  const visibleFineBases = FINE_BASES.filter(basis => {
    if (lawScope === "all") return true;
    if (lawScope === "ll97") return basis.lawId === "ll97" || basis.lawId === "art321";
    return basis.lawId === lawScope;
  });

  const sorted = [...buildings].sort((a, b) => {
    if (lawScope === "ll97") return (ll97Fine(b, 1) ?? 0) - (ll97Fine(a, 1) ?? 0);
    const bExposure = taskExposure(visibleTasks.filter(task => task.buildingId === b.id));
    const aExposure = taskExposure(visibleTasks.filter(task => task.buildingId === a.id));
    return bExposure - aExposure;
  });
  const showLl97Columns = lawScope === "ll97";
  const selectedLawLabel =
    LAW_OPTIONS.find(law => law.id === lawScope)?.label ?? "All laws";

  return (
    <div className="@container/main flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Portfolio</h1>

      <div className="rounded-xl border bg-background">
        <div className="grid gap-2 px-4 py-3 @md/main:grid-cols-[5.5rem_1fr] @md/main:items-start">
          <p className="pt-1.5 text-xs font-medium text-muted-foreground">Law scope</p>
          <div className="flex flex-wrap gap-1.5">
            {LAW_OPTIONS.map(law => (
              <Button
                key={law.id}
                type="button"
                size="sm"
                variant={lawScope === law.id ? "default" : "outline"}
                onClick={() => setLawScope(law.id)}
              >
                {law.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 border-t px-4 py-3 @md/main:grid-cols-[5.5rem_1fr_auto] @md/main:items-start">
          <p className="pt-1.5 text-xs font-medium text-muted-foreground">Fine basis</p>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              {visibleFineBases.map(basis => (
                <Button
                  key={basis.id}
                  type="button"
                  size="sm"
                  variant={fineBasisId === basis.id ? "default" : "outline"}
                  onClick={() => setFineBasisId(basis.id)}
                >
                  {basis.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {activeFineBasis.detail}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {activeFineBasis.type}
            </p>
            <p className="font-heading whitespace-nowrap text-xl font-bold text-destructive">
              {activeFineBasis.value}
              <span className="ml-1 text-sm font-medium">{activeFineBasis.unit}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 @sm/main:flex-row">
        <AddressAutocomplete
          value={address}
          onValueChange={setAddress}
          placeholder="Street address with borough"
          className="flex-1"
          inputClassName="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button onClick={() => submitAddress()} className="h-10 shrink-0">
          Get my number
        </Button>
      </div>

      {recentAddresses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Recent:</span>
          {recentAddresses.map(recent => (
            <Button
              key={recent}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => submitAddress(recent)}
            >
              {recent}
            </Button>
          ))}
        </div>
      )}

      {/* Metric strip */}
      <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-2 @xl/main:grid-cols-4">
        <MetricTile
          icon={<Building2 className="size-4" />}
          label="Buildings"
          value={String(buildings.length)}
        />
        <MetricTile
          icon={<ListTodo className="size-4" />}
          label={`${selectedLawLabel} open tasks`}
          value={String(visibleOpenTasks.length)}
        />
        <MetricTile
          icon={<CircleDollarSign className="size-4" />}
          label="Fine basis"
          value={activeFineBasis.value}
          sub={activeFineBasis.unit}
        />
        <MetricTile
          icon={<TrendingUp className="size-4" />}
          label={showLl97Columns ? "2030–2034 exposure" : "Tracked exposure"}
          value={
            showLl97Columns
              ? total2030 > 0
                ? `${fmtUsd(total2030)}/yr`
                : "—"
              : visibleTaskExposure > 0
                ? `${fmtUsd(visibleTaskExposure)}/yr`
                : "Tracked"
          }
          danger={(showLl97Columns ? total2030 : visibleTaskExposure) > 0}
          sub={
            showLl97Columns && total2030 > 0 && totalCurrent > 0
              ? `${(total2030 / totalCurrent).toFixed(1)}× current`
              : undefined
          }
        />
      </div>

      {/* Buildings table */}
      <Card>
        <CardHeader>
          <CardTitle>Buildings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {buildings.length === 0 ? (
            <EmptyFolder
              title="No buildings yet"
              description="Add an address to start building your portfolio."
            />
          ) : (
            <Table className="tabular-nums">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="pl-6">Address</TableHead>
                  <TableHead className="text-right">Sqft</TableHead>
                  {showLl97Columns ? (
                    <>
                      <TableHead className="text-right">Emissions</TableHead>
                      <TableHead className="text-right">2024–2029</TableHead>
                      <TableHead className="text-right">2030–2034</TableHead>
                      <TableHead className="text-right">2035–2039</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="text-right">Law tasks</TableHead>
                      <TableHead className="text-right">Estimated exposure</TableHead>
                    </>
                  )}
                  <TableHead className="pr-6 text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(b => {
                  const fine0 = ll97Fine(b, 0);
                  const fine1 = ll97Fine(b, 1);
                  const fine2 = ll97Fine(b, 2);
                  const buildingLawTasks = visibleTasks.filter(
                    task => task.buildingId === b.id,
                  );
                  const open = openTaskCount(b.id, visibleTasks);
                  const buildingExposure = taskExposure(buildingLawTasks);

                  return (
                    <TableRow
                      key={String(b.id)}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/buildings/${b.id}`)}
                    >
                      <TableCell className="pl-6 font-medium">{b.address}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {b.sqft.toLocaleString()}
                      </TableCell>
                      {showLl97Columns ? (
                        <>
                          <TableCell className="text-right text-muted-foreground">
                            {b.annualEmissionsTco2E !== undefined ? (
                              `${b.annualEmissionsTco2E.toLocaleString(undefined, { maximumFractionDigits: 0 })} t`
                            ) : (
                              <span className="text-xs italic">missing</span>
                            )}
                          </TableCell>
                          <FineCell fine={fine0} />
                          <FineCell fine={fine1} highlight />
                          <FineCell fine={fine2} />
                        </>
                      ) : (
                        <>
                          <TableCell className="text-right text-muted-foreground">
                            {buildingLawTasks.length || (
                              <span className="text-xs italic">missing</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {buildingExposure > 0 ? (
                              fmtUsd(buildingExposure)
                            ) : buildingLawTasks.length > 0 ? (
                              <span className="text-xs">Tracked</span>
                            ) : (
                              <span className="text-xs italic">missing</span>
                            )}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="pr-6 text-right">
                        {open > 0 ? (
                          <Badge variant="secondary">{open}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Data sourced from NYC LL84 benchmarking submissions and LL97 emission limits (1
        RCNY §103-14). Not legal advice — official compliance requires a registered design
        professional.
      </p>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  danger,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  danger?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-background px-5 py-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span
          className={`flex size-7 items-center justify-center rounded-full ${danger ? "bg-destructive-subtle text-destructive" : "bg-secondary"}`}
        >
          {icon}
        </span>
        <p className="text-xs">{label}</p>
      </div>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FineCell({ fine, highlight }: { fine: number | null; highlight?: boolean }) {
  if (fine === null) {
    return (
      <TableCell className="text-right text-xs italic text-muted-foreground">
        missing
      </TableCell>
    );
  }
  if (fine === 0) {
    return (
      <TableCell className="text-right text-xs font-medium text-success">$0</TableCell>
    );
  }
  return (
    <TableCell
      className={`text-right text-xs font-medium ${highlight ? "text-destructive" : ""}`}
    >
      {fmtUsd(fine)}
    </TableCell>
  );
}
