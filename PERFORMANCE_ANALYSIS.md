# Performance Analysis Report

Generated: 2025-12-12

This document outlines performance anti-patterns, N+1 queries, unnecessary re-renders, and inefficient algorithms found in the Loculus codebase.

## Summary Statistics

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Backend Database | 2 | 1 | 2 | - |
| React Performance | 2 | 3 | 6 | 2 |
| Algorithm Efficiency | - | 4 | 3 | - |
| API/Data Fetching | - | 2 | 3 | 2 |

---

## 🔴 CRITICAL Issues

### 1. N+1 Database Updates in Loop

**File:** `backend/src/main/kotlin/org/loculus/backend/service/submission/UploadDatabaseService.kt`
**Lines:** 350-360

```kotlin
submissionIdToAccessionMap.forEach { (submissionId, accession) ->
    MetadataUploadAuxTable.update(
        where = {
            (submissionIdColumn eq submissionId) and (uploadIdColumn eq uploadId)
        },
    ) {
        it[accessionColumn] = accession
        it[versionColumn] = 1
    }
}
```

**Impact:** N individual UPDATE queries for N records instead of single batch update.

**Fix:** Use batch UPDATE with CASE statements or Exposed's batch operations.

---

### 2. N+1 SELECT Queries for Record Existence Check

**File:** `backend/src/main/kotlin/org/loculus/backend/service/seqsetcitations/SeqSetCitationsDatabaseService.kt`
**Lines:** 148-175

```kotlin
for (record in seqSetRecords) {
    val existingRecord = SeqSetRecordsTable
        .selectAll()
        .where {
            (SeqSetRecordsTable.accession eq record.accession) and
                (SeqSetRecordsTable.isFocal eq record.isFocal)
        }
        .singleOrNull()
    // ...
}
```

**Impact:** N database queries for N records.

**Fix:** Load all existing records in single query, check membership in-memory using a Map.

---

### 3. QueryClient Created Inside Component Body

**Files:**
- `website/src/components/SearchPage/SearchForm.tsx:33`
- `website/src/components/SearchPage/SearchFullUI.tsx:407`

```typescript
export const SearchFullUI = (props: InnerSearchFullUIProps) => {
    const queryClient = new QueryClient(); // Creates new instance every render!
    return (
        <QueryClientProvider client={queryClient}>
            <InnerSearchFullUI {...props} />
        </QueryClientProvider>
    );
};
```

**Impact:** New QueryClient instance on every render, losing all cached data.

**Fix:** Move `new QueryClient()` outside component or use `useMemo`.

---

### 4. Array Index Used as React Key (17+ instances)

**Files:**
- `website/src/components/SearchPage/Table.tsx:234`
- `website/src/components/SequenceDetailsPage/DataTable.tsx:26,79`
- `website/src/components/SearchPage/fields/MutationField.tsx:75,127`
- `website/src/components/ReviewPage/ReviewCard.tsx:267`
- And 12+ more files

```tsx
{tableData.map((row, index) => (
    <tr key={index}> {/* Should use row.id or unique identifier */}
```

**Impact:** Incorrect reconciliation when items are added/removed/reordered, causing lost state and visual glitches.

**Fix:** Use unique identifiers from data (accession, id, etc.) instead of array index.

---

## 🟠 HIGH Severity Issues

### 5. Sequential S3 Operations

**File:** `backend/src/main/kotlin/org/loculus/backend/service/submission/SubmissionDatabaseService.kt`
**Lines:** 266-271, 633-635

```kotlin
for (entry in releasedEntries) {
    for (fileId in processedFiles[entry]!!) {
        s3Service.setFileToPublic(fileId)  // Sequential I/O
        releasedFiles.add(fileId)
    }
}
```

**Impact:** Blocking I/O operations executed sequentially.

**Fix:** Batch S3 operations or parallelize with coroutines.

---

### 6. Two Database Requests Per Sequence Entry

**File:** `backend/src/main/kotlin/org/loculus/backend/service/submission/SubmissionDatabaseService.kt`
**Lines:** 520-543

Documented in TODO #3951. Makes 2 DB requests per entry for file validation.

---

### 7. Double Sorting of Same Dataset

**File:** `ingest/scripts/compare_hashes.py`
**Lines:** 176-183

```python
sorted_versions = sorted(versions, key=lambda x: int(x["version"]), reverse=True)
# ...
non_revoked_versions = sorted(
    [v for v in versions if not v.get("isRevocation", False)],
    key=lambda x: int(x["version"]),
    reverse=True,
)
```

**Impact:** O(n log n) sorting done twice on same data.

**Fix:** Sort once, filter the sorted result.

---

### 8. O(n*m) Column Width Calculation

**File:** `cli/src/loculus_cli/commands/get.py`
**Lines:** 551-554

```python
for key in shown_columns:
    max_content_width = max(len(str(item.get(key, ""))) for item in data)
```

**Impact:** Full iteration over all rows for each column.

**Fix:** Calculate all column widths in single pass through data.

---

### 9. List Instead of Set for Membership Testing

**File:** `cli/src/loculus_cli/commands/get.py`
**Lines:** 420-426

```python
field_list = [f.strip() for f in fields.split(",")]
for item in data:
    filtered_item = {k: v for k, v in item.items() if k in field_list}
```

**Impact:** O(m) lookup per item instead of O(1).

**Fix:** `field_set = set(f.strip() for f in fields.split(","))`

---

### 10. Sequential File Uploads

**File:** `website/src/components/Submission/FileUpload/FolderUploadComponent.tsx`
**Lines:** 98-145

Files uploaded one at a time in nested forEach loops.

**Fix:** Use `Promise.all()` for parallel uploads.

---

### 11. Missing Data Caching in Modal

**File:** `website/src/components/SearchPage/SeqPreviewModal.tsx`
**Lines:** 55-72

```typescript
useEffect(() => {
    if (seqId) {
        void fetch(`/seq/${seqId}/details.json`)
            .then((res) => res.json())
            .then(setData);
    }
}, [accessToken, seqId]);
```

**Impact:** Same data re-fetched every time modal opens.

**Fix:** Use React Query with caching.

---

## 🟡 MEDIUM Severity Issues

### 12. Linear Search Inside Loop

**File:** `backend/src/main/kotlin/org/loculus/backend/service/seqsetcitations/SeqSetCitationsDatabaseService.kt`
**Lines:** 418-432

```kotlin
for (seqSetId in uniqueSeqSetIds) {
    val year = latestSeqSetWithUserAccession
        .first { it.seqSetId.toString() == seqSetId }  // O(n) search
        .createdAt.toLocalDateTime().year.toLong()
}
```

**Fix:** Pre-create map: `val seqSetIdToEntry = latestSeqSetWithUserAccession.associateBy { it.seqSetId.toString() }`

---

### 13. Repeated JSON Parsing

**File:** `ingest/scripts/loculus_client.py`
**Lines:** 155-156

```python
if len(get_groups_response.json()) > 0:
    group_id = get_groups_response.json()[0]["groupId"]  # Parsed twice
```

**Fix:** `data = response.json()` then use `data` variable.

---

### 14. Inline Chart Objects Not Memoized

**File:** `website/src/components/SeqSetCitations/CitationPlot.tsx`
**Lines:** 32-61

`data={{}}` and `options={{}}` objects created on every render.

**Fix:** Wrap with `useMemo()`.

---

### 15. useEffect Missing Dependencies

**File:** `website/src/components/SearchPage/SearchFullUI.tsx`
**Lines:** 131-135

```typescript
useEffect(() => {
    if (showEditDataUseTermsControls && dataUseTermsEnabled) {
        setAColumnVisibility(DATA_USE_TERMS_FIELD, true);
    }
}, []); // Missing dependencies
```

**Fix:** Add `showEditDataUseTermsControls, dataUseTermsEnabled` to deps array.

---

### 16. Inline Style Objects (13+ instances)

Creating new style objects on every render in:
- `SeqSetList.tsx:186`
- `SearchFullUI.tsx:262`
- `DataTableEntry.tsx:18`
- `Table.tsx:77,222,291`
- And more

**Fix:** Extract to constants or use `useMemo`.

---

### 17. String Concatenation in Loops (Python)

**File:** `preprocessing/nextclade/src/loculus_preprocessing/processing_functions.py`
**Lines:** 818-821

```python
for name in invalid_names[:3]:
    names_to_show += f"'{name}'" + "; "
```

**Fix:** Use `"; ".join(f"'{name}'" for name in invalid_names[:3])`

---

### 18. Blocking Polling Loops

Multiple files use `while True` with fixed `sleep()`:
- `preprocessing/nextclade/src/loculus_preprocessing/prepro.py:604-614`
- `ingest/scripts/loculus_client.py:104,209,449,473`
- `ena-submission/src/ena_deposition/*.py` (multiple files)

**Fix:** Consider exponential backoff or event-driven patterns.

---

## 🟢 LOW Severity Issues

### 19. Large Components (>400 lines)

Should be split into smaller, focused components:
- `ReviewCard.tsx` - 531 lines
- `DataUploadForm.tsx` - 480 lines
- `FolderUploadComponent.tsx` - 455 lines
- `ReviewPage.tsx` - 427 lines
- `SearchFullUI.tsx` - 414 lines

---

### 20. No React.memo Usage

Zero instances of `React.memo` found. Components receiving stable props could benefit from memoization.

---

### 21. Aggressive Polling Interval

**File:** `website/src/hooks/useSubmissionOperations.ts:51`

```typescript
refetchInterval: 2000,  // Every 2 seconds
```

Consider longer interval or conditional polling based on status.

---

### 22. Over-fetching from Multiple LAPIS Instances

**File:** `website/src/components/SeqSetCitations/SeqSetRecordsTableWithMetadata.tsx:49-67`

Queries all LAPIS instances for accessions that may not exist in all organisms.

---

## Recommendations by Priority

### Immediate (High Impact, Low Effort)
1. Move QueryClient outside components
2. Replace array index keys with unique identifiers
3. Convert field_list to set in CLI
4. Cache response.json() results

### Short-term (High Impact)
5. Batch database updates in UploadDatabaseService
6. Pre-fetch records before loop in SeqSetCitationsDatabaseService
7. Parallelize file uploads with Promise.all()
8. Parallelize S3 operations

### Medium-term (Moderate Impact)
9. Add React Query caching to SeqPreviewModal
10. Memoize chart data/options
11. Fix useEffect dependencies
12. Refactor large components

---

## Good Patterns Found (For Reference)

The codebase already demonstrates some good practices:
- `FilesDatabaseService.kt` uses `chunkedForDatabase()` for batch operations
- `DataUseTermsDatabaseService.kt` uses `processInDatabaseSafeChunks()`
- `CompressionDictService.kt` caches data at startup
- Multiple components correctly use `useMemo` for expensive computations
