export type TestRevision = {
  id: string;
  snapshot: { applicationStatus: string; memo: string; nextActionAt: string | null };
  changedAt: string;
  deviceId: string;
  changeKind: "update" | "delete" | "restore";
};

export type TestJob = {
  id: string;
  applicationStatus: string;
  memo: string;
  nextActionAt: string | null;
  updatedAt: string;
  deleted: boolean;
  revisions: TestRevision[];
};

const initialJob = (id: string): TestJob => ({
  id,
  applicationStatus: "unreviewed",
  memo: "",
  nextActionAt: null,
  updatedAt: new Date().toISOString(),
  deleted: false,
  revisions: [],
});

const globalStore = globalThis as typeof globalThis & {
  __jobHubE2eJobs?: Map<string, TestJob>;
};
const jobs = globalStore.__jobHubE2eJobs ??= new Map<string, TestJob>();

function copy(job: TestJob): TestJob {
  return structuredClone(job);
}

export function getTestJob(id: string) {
  if (!jobs.has(id)) jobs.set(id, initialJob(id));
  return copy(jobs.get(id)!);
}

export function resetTestJob(id: string) {
  const job = initialJob(id);
  jobs.set(id, job);
  return copy(job);
}

function revision(job: TestJob, deviceId: string, changeKind: TestRevision["changeKind"]): TestRevision {
  return {
    id: crypto.randomUUID(),
    snapshot: {
      applicationStatus: job.applicationStatus,
      memo: job.memo,
      nextActionAt: job.nextActionAt,
    },
    changedAt: new Date().toISOString(),
    deviceId,
    changeKind,
  };
}

export function updateTestJob(
  id: string,
  values: Pick<TestJob, "applicationStatus" | "memo" | "nextActionAt">,
  deviceId: string,
) {
  const job = getTestJob(id);
  job.revisions.unshift(revision(job, deviceId, "update"));
  Object.assign(job, values, { updatedAt: new Date().toISOString(), deleted: false });
  jobs.set(id, job);
  return copy(job);
}

export function restoreTestJob(id: string, revisionId: string, deviceId: string) {
  const job = getTestJob(id);
  const selected = job.revisions.find((item) => item.id === revisionId);
  if (!selected) throw new Error("revision not found");
  job.revisions.unshift(revision(job, deviceId, "restore"));
  Object.assign(job, selected.snapshot, { updatedAt: new Date().toISOString(), deleted: false });
  jobs.set(id, job);
  return copy(job);
}

export function deleteTestJob(id: string, deviceId: string) {
  const job = getTestJob(id);
  job.revisions.unshift(revision(job, deviceId, "delete"));
  job.deleted = true;
  job.updatedAt = new Date().toISOString();
  jobs.set(id, job);
  return copy(job);
}