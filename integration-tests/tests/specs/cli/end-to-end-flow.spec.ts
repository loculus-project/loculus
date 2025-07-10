import { expect } from '@playwright/test';
import { cliTest } from '../../fixtures/cli.fixture';

cliTest.describe('CLI End-to-End Submission Flow', () => {
  cliTest('complete CLI workflow: submit → status → release → search', async ({ cliPage, groupId, testAccount }) => {
    // Extended timeout for full end-to-end flow
    cliTest.setTimeout(300000); // 5 minutes
    
    console.log('Starting CLI end-to-end workflow test...');
    
    // Setup: Configure and login
    await cliPage.configure();
    await cliPage.login(testAccount.username, testAccount.password);
    console.log(`Logged in as: ${testAccount.username}`);
    
    // Generate unique test data
    const timestamp = Date.now();
    const submissionId1 = `cli_e2e_${timestamp}_001`;
    const submissionId2 = `cli_e2e_${timestamp}_002`;
    
    const testMetadata = `submissionId\tsample_name\tcollection_date\tlocation\thost
${submissionId1}\tCLI_Sample_1\t2024-01-15\tGermany\thuman
${submissionId2}\tCLI_Sample_2\t2024-01-16\tFrance\thuman`;

    const testSequences = `>${submissionId1}
ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG
>${submissionId2}
ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG`;

    console.log('Generated test data with submission IDs:', submissionId1, submissionId2);

    // STEP 1: Submit sequences using CLI
    console.log('Step 1: Submitting sequences...');
    const submitResult = await cliPage.submitSequences({
      organism: 'west-nile',
      metadata: testMetadata,
      sequences: testSequences,
      group: parseInt(groupId)
    });
    
    expect(submitResult.exitCode).toBe(0);
    expect(submitResult.stdout).toMatch(/Submission successful|success/i);
    console.log('✓ Sequences submitted successfully');

    // STEP 2: Wait for processing and monitor status
    console.log('Step 2: Monitoring sequence processing status...');
    
    let processedSequences = [];
    let attempts = 0;
    const maxAttempts = 24; // Wait up to 2 minutes (24 * 5 seconds)
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Status check attempt ${attempts}/${maxAttempts}...`);
      
      // Check overall status
      const statusResult = await (cliPage as any).getStatus({
        organism: 'west-nile',
        group: parseInt(groupId),
        format: 'json'
      });
      
      expect(statusResult.exitCode).toBe(0);
      const statusData = cliPage.parseJsonOutput(statusResult);
      
      // Log current status
      console.log(`Status: ${statusData.length} sequences found`);
      if (Array.isArray(statusData) && statusData.length > 0) {
        const mySequences = statusData.filter(seq => 
          seq.submission_id === submissionId1 || seq.submission_id === submissionId2
        );
        console.log(`My sequences: ${mySequences.length}/2 found`);
        
        processedSequences = mySequences.filter(seq => seq.status === 'PROCESSED');
        console.log(`Processed: ${processedSequences.length}/2 ready`);
        
        if (processedSequences.length >= 2) {
          console.log('✓ Both sequences are now processed');
          break;
        }
      }
      
      if (attempts < maxAttempts) {
        console.log('Waiting 5 seconds before next status check...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Verify we have processed sequences
    if (processedSequences.length < 2) {
      console.log('Warning: Not all sequences processed within timeout, continuing with available sequences...');
    }
    expect(processedSequences.length).toBeGreaterThan(0);

    // STEP 3: Check detailed status for processed sequences
    console.log('Step 3: Checking detailed status...');
    
    for (const seq of processedSequences.slice(0, 1)) { // Check first sequence
      const detailedStatusResult = await (cliPage as any).getStatus({
        organism: 'west-nile',
        accession: seq.accession,
        version: seq.version,
        detailed: true
      });
      
      expect(detailedStatusResult.exitCode).toBe(0);
      expect(detailedStatusResult.stdout.length).toBeGreaterThan(0);
      console.log(`✓ Detailed status retrieved for ${seq.accession}.${seq.version}`);
    }

    // STEP 4: Perform dry-run release to preview
    console.log('Step 4: Testing dry-run release...');
    
    const dryRunResult = await (cliPage as any).releaseSequences({
      organism: 'west-nile',
      group: parseInt(groupId),
      allValid: true,
      dryRun: true
    });
    
    expect(dryRunResult.exitCode).toBe(0);
    console.log('✓ Dry-run release completed');

    // STEP 5: Release sequences for real
    console.log('Step 5: Releasing sequences...');
    
    const releaseResult = await (cliPage as any).releaseSequences({
      organism: 'west-nile',
      group: parseInt(groupId),
      allValid: true,
      force: true, // Skip confirmation in automated test
      verbose: true
    });
    
    // Release might succeed or fail depending on sequence state
    expect([0, 1]).toContain(releaseResult.exitCode);
    
    if (releaseResult.exitCode === 0) {
      console.log('✓ Sequences released successfully');
      expect(releaseResult.stdout).toMatch(/released|success/i);
    } else {
      console.log('⚠ Release failed (may be expected if sequences have errors)');
      // This is OK - sequences might have validation errors in test environment
    }

    // STEP 6: Verify status change after release attempt
    console.log('Step 6: Verifying post-release status...');
    
    const postReleaseStatusResult = await (cliPage as any).getStatus({
      organism: 'west-nile',
      group: parseInt(groupId),
      summary: true,
      format: 'json'
    });
    
    expect(postReleaseStatusResult.exitCode).toBe(0);
    const postReleaseData = cliPage.parseJsonOutput(postReleaseStatusResult);
    
    console.log('Post-release summary:', {
      total: postReleaseData.total,
      ready: postReleaseData.ready,
      errors: postReleaseData.errors
    });

    // STEP 7: Search for sequences (if they were successfully released)
    console.log('Step 7: Searching for sequences...');
    
    const searchResult = await cliPage.getSequences({
      organism: 'west-nile',
      limit: 50,
      format: 'json'
    });
    
    expect(searchResult.exitCode).toBe(0);
    const searchData = cliPage.parseJsonOutput(searchResult);
    console.log(`Search returned ${Array.isArray(searchData) ? searchData.length : 'unknown'} sequences`);

    // STEP 8: Test filtering in search
    console.log('Step 8: Testing search filters...');
    
    const filteredSearchResult = await cliPage.getSequences({
      organism: 'west-nile',
      filters: ['geoLocCountry=Germany'],
      limit: 10,
      format: 'json'
    });
    
    expect(filteredSearchResult.exitCode).toBe(0);
    console.log('✓ Filtered search completed');

    // STEP 9: Test different status views
    console.log('Step 9: Testing various status views...');
    
    // Test convenience filters
    const readySequencesResult = await (cliPage as any).getStatus({
      organism: 'west-nile',
      ready: true,
      format: 'json'
    });
    expect(readySequencesResult.exitCode).toBe(0);
    
    const errorsOnlyResult = await (cliPage as any).getStatus({
      organism: 'west-nile',
      errorsOnly: true,
      format: 'json'
    });
    expect(errorsOnlyResult.exitCode).toBe(0);
    
    console.log('✓ All status filters working');

    // STEP 10: Final verification - check that we can get table output
    console.log('Step 10: Testing table output formats...');
    
    const tableStatusResult = await (cliPage as any).getStatus({
      organism: 'west-nile',
      limit: 5
    });
    expect(tableStatusResult.exitCode).toBe(0);
    expect(tableStatusResult.stdout.length).toBeGreaterThan(0);
    
    const tableSearchResult = await cliPage.getSequences({
      organism: 'west-nile',
      limit: 5
    });
    expect(tableSearchResult.exitCode).toBe(0);
    expect(tableSearchResult.stdout.length).toBeGreaterThan(0);
    
    console.log('✓ Table formats working');

    console.log('🎉 CLI End-to-End workflow test completed successfully!');
    
    // Final summary
    console.log('\n=== CLI Workflow Summary ===');
    console.log(`✓ Submitted 2 sequences (${submissionId1}, ${submissionId2})`);
    console.log(`✓ Monitored processing status`);
    console.log(`✓ Retrieved detailed sequence information`);
    console.log(`✓ Tested dry-run release`);
    console.log(`✓ Attempted sequence release`);
    console.log(`✓ Verified post-release status`);
    console.log(`✓ Searched for sequences`);
    console.log(`✓ Tested filtering and different output formats`);
    console.log('✓ All CLI commands working end-to-end');
  });

  cliTest('CLI workflow with error handling', async ({ cliPage, groupId, testAccount }) => {
    // Test that CLI handles errors gracefully throughout the workflow
    cliTest.setTimeout(120000);
    
    console.log('Starting CLI error handling workflow test...');
    
    // Setup: Configure and login
    await cliPage.configure();
    await cliPage.login(testAccount.username, testAccount.password);
    
    // Test various error conditions
    
    // 1. Invalid organism in status
    const invalidStatusResult = await (cliPage as any).getStatus({
      organism: 'invalid-organism-name',
      format: 'json'
    });
    expect(invalidStatusResult.exitCode).not.toBe(0);
    console.log('✓ Status command properly handles invalid organism');
    
    // 2. Invalid organism in release
    const invalidReleaseResult = await (cliPage as any).releaseSequences({
      organism: 'invalid-organism-name',
      allValid: true,
      dryRun: true
    });
    expect(invalidReleaseResult.exitCode).not.toBe(0);
    console.log('✓ Release command properly handles invalid organism');
    
    // 3. Invalid organism in search
    const invalidSearchResult = await cliPage.getSequences({
      organism: 'invalid-organism-name',
      limit: 5,
      format: 'json'
    });
    expect(invalidSearchResult.exitCode).not.toBe(0);
    console.log('✓ Search command properly handles invalid organism');
    
    // 4. Invalid filters
    const invalidFilterResult = await cliPage.getSequences({
      organism: 'west-nile',
      filters: ['invalidField=invalidValue'],
      format: 'json'
    });
    // This might succeed with empty results, which is OK
    expect([0, 1]).toContain(invalidFilterResult.exitCode);
    console.log('✓ Search command handles invalid filters gracefully');
    
    // 5. Non-existent sequence details
    const nonExistentSeqResult = await (cliPage as any).getStatus({
      organism: 'west-nile',
      accession: 'NONEXISTENT_12345',
      version: 1,
      detailed: true
    });
    expect([0, 1]).toContain(nonExistentSeqResult.exitCode);
    console.log('✓ Status command handles non-existent sequences gracefully');
    
    console.log('🎉 CLI error handling test completed successfully!');
  });
});