import {
  pageCursorFixtureProvider,
  tokenCursorFixtureProvider,
  type CatalogFixture,
  type CursorFixtureProvider,
} from "@/lib/sources/fixtures/catalog";
import {
  ProviderAdapterError,
  type FieldProvenanceEntry,
  type ProviderAdapter,
  type ProviderConfiguration,
} from "@/lib/sources/provider-adapter";

const allowedSourceFields = [
  "title",
  "companyName",
  "locations",
  "roleName",
  "career",
  "employmentType",
  "postedAt",
  "modifiedAt",
  "expiresAt",
] as const;

function configuration(provider: CursorFixtureProvider): ProviderConfiguration {
  return {
    code: provider.code,
    enabled: true,
    capabilities: {
      incremental: true,
      completeSnapshot: true,
      explicitClose: false,
      cursor: provider.cursorStyle,
    },
    compliance: {
      approvalStatus: "approved",
      termsUrl: `https://${provider.code}.example.invalid/terms`,
      attribution: { text: provider.code, href: `https://${provider.code}.example.invalid` },
      callLimits: { daily: null, scheduled: null, reserve: null, pageSize: null },
      retentionPolicy: { allowedSourceFields, retentionDays: null, purgeOnDisable: true },
      monetizationRestrictions: [],
    },
  };
}

function createFixtureAdapter(provider: CursorFixtureProvider): ProviderAdapter<CatalogFixture> {
  return {
    configuration: configuration(provider),
    async fetchPage(input) {
      if (input.signal.aborted) throw new ProviderAdapterError({ code: "SOURCE_TIMEOUT" });
      try {
        const page = provider.readPage(input.cursor);
        return {
          ...page,
          snapshotComplete: input.runKind === "reconciliation" && page.nextCursor === null,
          total: 60,
          fetchedAt: new Date().toISOString(),
        };
      } catch {
        throw new ProviderAdapterError({ code: "SOURCE_REQUEST_INVALID" });
      }
    },
    normalize(record, fetchedAt) {
      if (record.providerCode !== provider.code) {
        throw new ProviderAdapterError({ code: "SOURCE_RESPONSE_INVALID" });
      }
      const sourcePosting = { providerCode: provider.code, externalId: record.externalId };
      const provenance = (origin: FieldProvenanceEntry["origin"] = "source"): FieldProvenanceEntry => ({
        sourcePosting,
        origin,
        observedAt: fetchedAt,
      });
      return {
        providerCode: provider.code,
        externalId: record.externalId,
        originalUrl: record.originalUrl,
        sourceStatus: record.sourceStatus,
        fetchedAt,
        sourceValues: Object.fromEntries(allowedSourceFields.map((field) => [field, record[field]])),
        normalized: {
          title: record.title,
          companyName: record.companyName,
          roleName: record.roleName,
          locations: record.locations.map((label) => ({ label })),
          employmentTypes: [record.employmentType],
          experienceText: record.career,
          postedAt: record.postedAt,
          modifiedAt: record.modifiedAt,
          expiresAt: record.expiresAt,
          deadlineKind: "fixed",
        },
        fieldProvenance: {
          title: provenance(),
          companyName: provenance(),
          roleName: provenance(),
          locations: provenance(),
          employmentTypes: provenance("normalized"),
          experienceText: provenance("normalized"),
          postedAt: provenance(),
          modifiedAt: provenance(),
          expiresAt: provenance(),
          deadlineKind: provenance("normalized"),
        },
      };
    },
  };
}

export const pageCursorFixtureAdapter = createFixtureAdapter(pageCursorFixtureProvider);
export const tokenCursorFixtureAdapter = createFixtureAdapter(tokenCursorFixtureProvider);
