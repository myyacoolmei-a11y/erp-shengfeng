/**
 * Service category (派工工程類型) vs subsidy eligibility.
 * Source of truth for category is work_orders.project_type.
 * Subsidy is a separate concept: 保養 never requires it; 新裝 only if the case
 * is actually set to company-assisted.
 */
export function isMaintenanceProjectType(projectType: string | null | undefined): boolean {
  return (projectType ?? "").trim() === "保養";
}

/** 保養案件整個補助 workflow 不適用。 */
export function isSubsidyApplicableForProjectType(projectType: string | null | undefined): boolean {
  return !isMaintenanceProjectType(projectType);
}

/**
 * Whether this case currently requires the subsidy pipeline.
 * Not the same as project type: 新裝 can be subsidy_required false.
 */
export function isSubsidyRequired(opts: {
  projectType?: string | null;
  subsidyType?: string | null;
}): boolean {
  if (!isSubsidyApplicableForProjectType(opts.projectType)) return false;
  return opts.subsidyType === "company_assisted";
}
