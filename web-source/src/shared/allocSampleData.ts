import {
  DEFAULT_OFFICER_PROFILE,
  createDefaultTemplatesMap,
  type AllocationDatabase,
} from '../types/allocation';

export function createEmptyAllocationDatabase(): AllocationDatabase {
  const officer = { ...DEFAULT_OFFICER_PROFILE };
  const templates = createDefaultTemplatesMap(officer);

  return {
    ministryAllocations: [],
    dcAllocations: [],
    dealerSuballocations: [],
    projects: [],
    unoSuballocations: [],
    doBooks: [],
    doIssues: [],
    challans: [],
    foodDealers: [],
    omsDealers: [],
    chairmen: [],
    fireServices: [],
    rates: [],
    officer,
    templates,
    reportMemos: {},
  };
}
