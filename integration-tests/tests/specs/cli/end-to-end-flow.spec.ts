import { expect } from '@playwright/test';
import { cliTest } from '../../fixtures/cli.fixture';

cliTest.describe('CLI End-to-End Submission Flow', () => {
    cliTest(
        'complete CLI workflow: submit → status → release → search',
        async ({ cliPage, groupId, testAccount }) => {
            // Extended timeout for full end-to-end flow
            cliTest.setTimeout(300000); // 5 minutes

            // Setup: Configure and login
            await cliPage.configure();
            await cliPage.login(testAccount.username, testAccount.password);

            // Generate unique test data
            const timestamp = Date.now();
            const submissionId1 = `cli_e2e_${timestamp}_001`;
            const submissionId2 = `cli_e2e_${timestamp}_002`;

            const testMetadata = `authorAffiliations\tauthors\tgeoLocCountry\thostNameScientific\thostTaxonId\tsampleCollectionDate\tspecimenCollectorSampleId\tsubmissionId
"National Institute of Health, Department of Virology"\t"Ammar, M.; Salman, M.; Umair, M.; Ali, Q.; Hakim, R.; Haider, S.A.; Jamal, Z."\tPakistan\tHomo sapiens\t9606\t2023-08-26\tCCHF/NIHPAK-19/2023\t${submissionId1}
"Research Lab, University of Example"\t"Example, A.; Test, B.; Sample, C."\tColombia\tHomo sapiens\t9606\t2021-12-12\tXF499\t${submissionId2}`;

            const testSequences = `>${submissionId1}_L
CCACATTGACACAGANAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTAAGAAACCTTGACTGGACTCAGGTGATTGCTAGTCAGTATGTGACCAATCCCAGGTTTAATATCTCTGATTACTTCGAGATTGTTCGACAGCCTGGTGACGGGAACTGTTTCTACCACAGTATAGCTGAGTTAACCATGCCCAACAAAACAGATCACTCATACCATAACATCAAACATCTGACTGAGGTGGCAGCACGGAAGTATTATCAGGAGGAGCCGGAGGCTAAGCTCATTGGCCTGAGTCTGGAAGACTATCTTAAGAGGATGCTATCTGACAACGAATGGGGATCGACTCTTGAGGCATCTATGTTGGCTAAGGAAATGGGTATTACTATCATCATTTGGACTGTTGCAGCCAGTGACGAAGTGGAAGCAGGCATAAAGTTTGGTGATGGTGATGTGTTTACAGCCGTGAATCTTCTGCACTCCGGACAGACACACTTTGATGCCCTCAGAATACTGCCNCANTTTGAGGCTGACACAAGAGAGNCCTTNAGTCTGGTAGACAANNTNATAGCTGTGGACCANNTGACCTCNTCTTCAAGTGATGAANTGCAGGACTANGAAGANCTTGCTTTAGCACTTACNAGNGCGGAAGAACCATNTAGACGGTCTAGCNTGGATGAGGTNACCCTNTCTAAGAAACAAGCAGAGNTATTGAGGCAGAAGGCATCTCAGTTGTCNAAACTGGTTAATAAAAGTCAGAACATACCGACTAGAGTTGGCAGGGTTCTGGACTGTATGTTTAACTGCAAACTATGTGTTGAAATATCAGCTGACACTCTAATTCTGCGACCAGAATCTAAAGAAAGAATTGG
>${submissionId1}_M
GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATGCAGTTTTCTGCTTGCAGCTGTGCGGTCTAGGGAAAACTAACGGACTACACAATGGGACTGAACACAATAAGACACACGTTATGACAACGCCTGATGACAGTCAGAGCCCTGAACCGCCAGTGAGCACAGCCCTGCCTGTCACACCGGACCCTTCCACTGTCACACCTACAACACCAGCCAGCGGATTAGAAGGCTCAGGAGAGGTTCACACATCCTCTCCAATCACCACCAAGGGTTTGTCTCTGCCGGGGGCTACATCTGAGCTCCCTGCGACTACTAGCATAGTCACTTCAGGTGCAAGTGATGCCGATTCTAGCACACAGGCAGCCAGAGACACCCCTAAACCATCAGTCCGCACGAGTCTGCCCAACAGCCCTAGCACACCATCCACACCACAAGGCACACACCATCCCGTGAGGAGTCTGCTTTCAGTCACGAGCCCTAAGCCAGAAGAAACACCAACACCGTCAAAATCAAGCAAAGATAGCTCAGCAACCAACAGTCCTCACCCAGCCGCCAGCAGACCAACAACCCCTCCCACAACAGCCCAGAGACCCGCTGAAAACAACAGCCACAACACCACCGAACAGCTTGAGTCCTTAACACAATTAGCAACTTCAGGTTCAATGATCTCTCCAACACAGACAGTCCTCCCAAAGAGTGTTACTTCTATAGCCATTCAAGACATTCATCCCAGCCCAACAAATAGGTCTAAAAGAAACCTTGATATGGAAATAATCT
>${submissionId1}_S
GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAACAAATGGTTTGAGGAGTTCAAGAAAGGAAATGGACTTGTGGACACTTTCACAAACTCNTATTCCTTTTGTGAAAGCGTNCCAAATCTGGACAGNTTTGTNTTCCAGATGGCNAGTGCCACTGATGATGCACAAAANGANTCCATCTACGCATCTGCNCTGGTGGANGCAACCAAATTTTGTGCACCTATATACGAGTGTGCTTGGGCTAGCTCCACTGGCATTGTTAAAAAGGGACTGGAGTGGTTCGAGAAAAATGCAGGAACCATTAAATCCTGGGATGAGAGTTATACTGAGCTTAAAGTTGAAGTTCCCAAAATAGAACAACTCTCCAACTACCAGCAGGCTGCTCTCAAATGGAGAAAAGACATAGGCTTCCGTGTCAATGCAAATACGGCAGCTTTGAGTAACAAAGTCCTAGCAGAGTACAAAGTTCCTGGCGAGATTGTAATGTCTGTCAAAGAGATGTTGTCAGATATGATTAGAAGNAGGAACCTGATTCTCAACAGAGGTGGTGATGAGAACCCACGCGGCCCAGTTAGCCGTGAACATGTGGAGTGGTGC
>${submissionId2}_L
CCACATTGACACAGANAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTAAGAAACCTTGACTGGACTCAGGTGATTGCTAGTCAGTATGTGACCAATCCCAGGTTTAATATCTCTGATTACTTCGAGATTGTTCGACAGCCTGGTGACGGGAACTGTTTCTACCACAGTATAGCTGAGTTAACCATGCCCAACAAAACAGATCACTCATACCATAACATCAAACATCTGACTGAGGTGGCAGCACGGAAGTATTATCAGGAGGAGCCGGAGGCTAAGCTCATTGGCCTGAGTCTGGAAGACTATCTTAAGAGGATGCTATCTGACAACGAATGGGGATCGACTCTTGAGGCATCTATGTTGGCTAAGGAAATGGGTATTACTATCATCATTTGGACTGTTGCAGCCAGTGACGAAGTGGAAGCAGGCATAAAGTTTGGTGATGGTGATGTGTTTACAGCCGTGAATCTTCTGCACTCCGGACAGACACACTTTGATGCCCTCAGAATACTGCCNCANTTTGAGGCTGACACAAGAGAGNCCTTNAGTCTGGTAGACAANNTNATAGCTGTGGACCANNTGACCTCNTCTTCAAGTGATGAANTGCAGGACTANGAAGANCTTGCTTTAGCACTTACNAGNGCGGAAGAACCATNTAGACGGTCTAGCNTGGATGAGGTNACCCTNTCTAAGAAACAAGCAGAGNTATTGAGGCAGAAGGCATCTCAGTTGTCNAAACTGGTTAATAAAAGTCAGAACATACCGACTAGAGTTGGCAGGGTTCTGGACTGTATGTTTAACTGCAAACTATGTGTTGAAATATCAGCTGACACTCTAATTCTGCGACCAGAATCTAAAGAAAGAATTGG
>${submissionId2}_M
GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATGCAGTTTTCTGCTTGCAGCTGTGCGGTCTAGGGAAAACTAACGGACTACACAATGGGACTGAACACAATAAGACACACGTTATGACAACGCCTGATGACAGTCAGAGCCCTGAACCGCCAGTGAGCACAGCCCTGCCTGTCACACCGGACCCTTCCACTGTCACACCTACAACACCAGCCAGCGGATTAGAAGGCTCAGGAGAGGTTCACACATCCTCTCCAATCACCACCAAGGGTTTGTCTCTGCCGGGGGCTACATCTGAGCTCCCTGCGACTACTAGCATAGTCACTTCAGGTGCAAGTGATGCCGATTCTAGCACACAGGCAGCCAGAGACACCCCTAAACCATCAGTCCGCACGAGTCTGCCCAACAGCCCTAGCACACCATCCACACCACAAGGCACACACCATCCCGTGAGGAGTCTGCTTTCAGTCACGAGCCCTAAGCCAGAAGAAACACCAACACCGTCAAAATCAAGCAAAGATAGCTCAGCAACCAACAGTCCTCACCCAGCCGCCAGCAGACCAACAACCCCTCCCACAACAGCCCAGAGACCCGCTGAAAACAACAGCCACAACACCACCGAACAGCTTGAGTCCTTAACACAATTAGCAACTTCAGGTTCAATGATCTCTCCAACACAGACAGTCCTCCCAAAGAGTGTTACTTCTATAGCCATTCAAGACATTCATCCCAGCCCAACAAATAGGTCTAAAAGAAACCTTGATATGGAAATAATCT
>${submissionId2}_S
GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAACAAATGGTTTGAGGAGTTCAAGAAAGGAAATGGACTTGTGGACACTTTCACAAACTCNTATTCCTTTTGTGAAAGCGTNCCAAATCTGGACAGNTTTGTNTTCCAGATGGCNAGTGCCACTGATGATGCACAAAANGANTCCATCTACGCATCTGCNCTGGTGGANGCAACCAAATTTTGTGCACCTATATACGAGTGTGCTTGGGCTAGCTCCACTGGCATTGTTAAAAAGGGACTGGAGTGGTTCGAGAAAAATGCAGGAACCATTAAATCCTGGGATGAGAGTTATACTGAGCTTAAAGTTGAAGTTCCCAAAATAGAACAACTCTCCAACTACCAGCAGGCTGCTCTCAAATGGAGAAAAGACATAGGCTTCCGTGTCAATGCAAATACGGCAGCTTTGAGTAACAAAGTCCTAGCAGAGTACAAAGTTCCTGGCGAGATTGTAATGTCTGTCAAAGAGATGTTGTCAGATATGATTAGAAGNAGGAACCTGATTCTCAACAGAGGTGGTGATGAGAACCCACGCGGCCCAGTTAGCCGTGAACATGTGGAGTGGTGC`;

            const submitResult = await cliPage.submitSequences({
                organism: 'cchf',
                metadata: testMetadata,
                sequences: testSequences,
                group: groupId,
            });

            expect(submitResult.exitCode).toBe(0);
            expect(submitResult.stdout).toMatch(/Submission successful|success/i);

            let processedSequences: {
                length: number;
                submission_id: string;
                status: string;
                accession: string;
                version: number;
            }[] = [];
            let attempts = 0;
            const maxAttempts = 24; // Wait up to 2 minutes (24 * 5 seconds)

            while (attempts < maxAttempts) {
                attempts++;

                // Check overall status
                const statusResult = await cliPage.getStatus({
                    organism: 'cchf',
                    group: groupId,
                    format: 'json',
                });

                expect(statusResult.exitCode).toBe(0);
                const statusData = cliPage.parseJsonOutput(statusResult) as {
                    length: number;
                    submission_id: string;
                    status: string;
                    accession: string;
                    version: number;
                }[];

                if (Array.isArray(statusData) && statusData.length > 0) {
                    const mySequences = statusData.filter(
                        (seq) =>
                            seq.submission_id === submissionId1 ||
                            seq.submission_id === submissionId2,
                    );

                    processedSequences = mySequences.filter((seq) => seq.status === 'PROCESSED');

                    if (processedSequences.length >= 2) {
                        break;
                    }
                }

                if (attempts < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                }
            }

            expect(processedSequences.length).toBeGreaterThan(0);

            for (const seq of processedSequences.slice(0, 1)) {
                // Check first sequence
                const detailedStatusResult = await cliPage.getStatus({
                    organism: 'cchf',
                    accession: seq.accession,
                    version: seq.version,
                    detailed: true,
                });

                expect(detailedStatusResult.exitCode).toBe(0);
                expect(detailedStatusResult.stdout.length).toBeGreaterThan(0);
            }

            const dryRunResult = await cliPage.releaseSequences({
                organism: 'cchf',
                group: groupId,
                allValid: true,
                dryRun: true,
            });

            expect(dryRunResult.exitCode).toBe(0);

            const releaseResult = await cliPage.releaseSequences({
                organism: 'cchf',
                group: groupId,
                allValid: true,
                force: true, // Skip confirmation in automated test
                verbose: true,
            });

            // Release should succeed since dry-run succeeded and we have processed sequences
            cliPage.assertSuccess(releaseResult, 'Release sequences');

            // Since we have processed sequences and dry-run succeeded, we should have released sequences
            expect(releaseResult.stdout).toMatch(/released|Released \d+ sequence/i);

            const postReleaseStatusResult = await cliPage.getStatus({
                organism: 'cchf',
                group: groupId,
                summary: true,
                format: 'json',
            });

            expect(postReleaseStatusResult.exitCode).toBe(0);
            cliPage.parseJsonOutput(postReleaseStatusResult) as {
                total?: number;
                ready?: number;
                errors?: number;
            };

            const searchResult = await cliPage.getSequences({
                organism: 'cchf',
                limit: 50,
                format: 'json',
            });

            expect(searchResult.exitCode).toBe(0);
            cliPage.parseJsonOutput(searchResult);

            // STEP 8: Test filtering in search

            const filteredSearchResult = await cliPage.getSequences({
                organism: 'cchf',
                filters: ['geoLocCountry=Pakistan'],
                limit: 10,
                format: 'json',
            });

            expect(filteredSearchResult.exitCode).toBe(0);

            // Test convenience filters with explicit group
            const readySequencesResult = await cliPage.getStatus({
                organism: 'cchf',
                ready: true,
                format: 'json',
                group: groupId,
            });
            expect(readySequencesResult.exitCode).toBe(0);

            const errorsOnlyResult = await cliPage.getStatus({
                organism: 'cchf',
                errorsOnly: true,
                format: 'json',
                group: groupId,
            });
            expect(errorsOnlyResult.exitCode).toBe(0);

            const tableStatusResult = await cliPage.getStatus({
                organism: 'cchf',
                limit: 5,
                group: groupId,
            });
            expect(tableStatusResult.exitCode).toBe(0);
            expect(tableStatusResult.stdout.length).toBeGreaterThan(0);

            const tableSearchResult = await cliPage.getSequences({
                organism: 'cchf',
                limit: 5,
            });
            expect(tableSearchResult.exitCode).toBe(0);
            expect(tableSearchResult.stdout.length).toBeGreaterThan(0);
        },
    );

    cliTest('CLI workflow with error handling', async ({ cliPage, testAccount }) => {
        // Test that CLI handles errors gracefully throughout the workflow
        cliTest.setTimeout(120000);

        // Setup: Configure and login
        await cliPage.configure();
        await cliPage.login(testAccount.username, testAccount.password);

        // Test various error conditions

        // 1. Invalid organism in status
        const invalidStatusResult = await cliPage.getStatus({
            organism: 'invalid-organism-name',
            format: 'json',
        });
        expect(invalidStatusResult.exitCode).not.toBe(0);

        // 2. Invalid organism in release
        const invalidReleaseResult = await cliPage.releaseSequences({
            organism: 'invalid-organism-name',
            allValid: true,
            dryRun: true,
        });
        expect(invalidReleaseResult.exitCode).not.toBe(0);

        // 3. Invalid organism in search
        const invalidSearchResult = await cliPage.getSequences({
            organism: 'invalid-organism-name',
            limit: 5,
            format: 'json',
        });
        expect(invalidSearchResult.exitCode).not.toBe(0);

        // 4. Invalid filters - should fail with validation error, not succeed with empty results
        const invalidFilterResult = await cliPage.getSequences({
            organism: 'cchf',
            filters: ['invalidField=invalidValue'],
            format: 'json',
        });
        expect(invalidFilterResult.exitCode).not.toBe(0);
        expect(invalidFilterResult.stderr).toMatch(/Field .* is not searchable/i);

        // 5. Non-existent sequence details - should fail when sequence doesn't exist
        const nonExistentSeqResult = await cliPage.getDetails({
            organism: 'cchf',
            accession: 'NONEXISTENT_12345.1',
        });
        expect(nonExistentSeqResult.exitCode).not.toBe(0);
        expect(nonExistentSeqResult.stderr).toMatch(/Aborted|not found|does not exist|No.*found/i);
    });
});
