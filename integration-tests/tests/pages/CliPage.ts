import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export interface CliResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export class CliPage {
    private baseUrl: string;
    private keyringService: string;
    private configFile: string;

    constructor() {
        // Get base URL from environment or default to localhost
        this.baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
        // Generate a unique keyring service name for this test instance
        this.keyringService = `loculus-cli-test-${process.pid}-${Date.now()}`;
        // Generate a unique config file for this test instance
        this.configFile = join(
            tmpdir(),
            `loculus-cli-test-config-${process.pid}-${Date.now()}.yml`,
        );
    }

    /**
     * Execute a CLI command with the given arguments
     */
    async execute(
        args: string[],
        options?: {
            cwd?: string;
            env?: Record<string, string>;
            timeout?: number;
        },
    ): Promise<CliResult> {
        const { cwd, env = {}, timeout = 30000 } = options || {};

        // Set up environment variables
        const cmdEnv = {
            ...process.env,
            ...env,
            // Extract instance from base URL
            LOCULUS_INSTANCE: this.baseUrl.replace(/https?:\/\//, ''),
            // Use unique keyring service for test isolation (stable per test instance)
            LOCULUS_CLI_KEYRING_SERVICE: this.keyringService,
            // Use unique config file for test isolation
            LOCULUS_CONFIG: this.configFile,
            // Disable interactive features like spinners
            CI: 'true',
            NO_COLOR: '1',
        };

        const command = `loculus ${args.join(' ')}`;

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd,
                env: cmdEnv,
                timeout,
            });

            return {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0,
            };
        } catch (error: unknown) {
            const execError = error as {
                stdout?: string;
                stderr?: string;
                message?: string;
                code?: number;
            };
            return {
                stdout: execError.stdout?.trim() || '',
                stderr: execError.stderr?.trim() || execError.message || '',
                exitCode: execError.code || 1,
            };
        }
    }

    /**
     * Create a temporary file with the given content
     */
    async createTempFile(content: string, suffix: string = '.tmp'): Promise<string> {
        const filename = `cli-test-${Date.now()}${suffix}`;
        const filepath = join(tmpdir(), filename);
        await writeFile(filepath, content, 'utf-8');
        return filepath;
    }

    /**
     * Clean up a temporary file
     */
    async cleanupFile(filepath: string): Promise<void> {
        try {
            await unlink(filepath);
        } catch {
            // Ignore cleanup errors
        }
    }

    /**
     * Clean up any existing CLI state
     */
    async cleanup(): Promise<void> {
        // Clear authentication state (ignore errors)
        await this.logout();

        // Clean up unique config file
        await this.cleanupFile(this.configFile);
    }

    /**
     * Configure the CLI for testing
     */
    async configure(instance?: string): Promise<void> {
        const instanceUrl = instance || this.baseUrl;

        // Clear any existing authentication state first
        await this.cleanup();

        // Add the instance using new command structure
        await this.executeAndAssertSuccess(
            ['instance', 'add', instanceUrl, '--set-default'],
            `Configure CLI instance: ${instanceUrl}`,
        );
    }

    /**
     * Set default organism
     */
    async setDefaultOrganism(organism: string): Promise<CliResult> {
        return this.execute(['organism', 'select', organism]);
    }

    /**
     * Set default group
     */
    async setDefaultGroup(groupId: number): Promise<CliResult> {
        return this.execute(['group', 'select', groupId.toString()]);
    }

    /**
     * Clear default organism
     */
    async clearDefaultOrganism(): Promise<CliResult> {
        return this.execute(['organism', 'select', '--none']);
    }

    /**
     * Clear default group
     */
    async clearDefaultGroup(): Promise<CliResult> {
        return this.execute(['group', 'select', '--none']);
    }

    /**
     * Get available organisms
     */
    async getAvailableOrganisms(): Promise<CliResult> {
        return this.execute(['organism', 'list']);
    }

    /**
     * Get available groups
     */
    async getAvailableGroups(): Promise<CliResult> {
        return this.execute(['group', 'list']);
    }

    /**
     * Login with username and password
     */
    async login(username: string, password: string): Promise<CliResult> {
        return this.execute(['auth', 'login', '--username', username, '--password', password]);
    }

    /**
     * Check authentication status
     */
    async authStatus(): Promise<CliResult> {
        return this.execute(['auth', 'status']);
    }

    /**
     * Logout
     */
    async logout(): Promise<CliResult> {
        return this.execute(['auth', 'logout']);
    }

    /**
     * Submit sequences
     */
    async submitSequences(options: {
        organism: string;
        metadata: string;
        sequences: string;
        group?: number;
        dataUseTerms?: string;
    }): Promise<CliResult> {
        const args = ['--organism', options.organism];

        if (options.group) {
            args.push('--group', options.group.toString());
        }

        args.push('submit', 'sequences');

        // Create temporary files
        const metadataFile = await this.createTempFile(options.metadata, '.tsv');
        const sequencesFile = await this.createTempFile(options.sequences, '.fasta');

        try {
            args.push('--metadata', metadataFile);
            args.push('--sequences', sequencesFile);

            if (options.dataUseTerms) {
                args.push('--data-use-terms', options.dataUseTerms);
            }

            return await this.execute(args);
        } finally {
            // Clean up temporary files
            await this.cleanupFile(metadataFile);
            await this.cleanupFile(sequencesFile);
        }
    }

    /**
     * Get sequences
     */
    async getSequences(options: {
        organism: string;
        filters?: string[];
        limit?: number;
        format?: string;
        output?: string;
    }): Promise<CliResult> {
        const args = ['--organism', options.organism, 'get', 'sequences'];

        // Add filters
        if (options.filters) {
            for (const filter of options.filters) {
                args.push('--filter', filter);
            }
        }

        if (options.limit) {
            args.push('--limit', options.limit.toString());
        }

        if (options.format) {
            args.push('--format', options.format);
        }

        if (options.output) {
            args.push('--output', options.output);
        }

        return this.execute(args);
    }

    /**
     * Generate metadata template
     */
    async generateTemplate(organism: string, output?: string): Promise<CliResult> {
        const args = ['--organism', organism, 'submit', 'template'];

        if (output) {
            args.push('--output', output);
        }

        return this.execute(args);
    }

    /**
     * Get details for a specific sequence
     */
    async getDetails(options: {
        organism: string;
        accession: string;
        format?: string;
    }): Promise<CliResult> {
        const args = ['--organism', options.organism, 'get', 'details'];

        args.push('--accession', options.accession);

        if (options.format) {
            args.push('--format', options.format);
        }

        return this.execute(args);
    }

    /**
     * Parse JSON output from CLI
     */
    parseJsonOutput(result: CliResult): unknown {
        try {
            return JSON.parse(result.stdout);
        } catch {
            const errorMessage = this.formatCliError('Failed to parse JSON output', result);
            throw new Error(errorMessage);
        }
    }

    /**
     * Format CLI error information for debugging
     */
    formatCliError(message: string, result: CliResult): string {
        const parts = [message];

        if (result.exitCode !== 0) {
            parts.push(`Exit code: ${result.exitCode}`);
        }

        if (result.stdout) {
            parts.push(`STDOUT:\n${result.stdout}`);
        }

        if (result.stderr) {
            parts.push(`STDERR:\n${result.stderr}`);
        }

        return parts.join('\n\n');
    }

    /**
     * Assert CLI command succeeded and format error if it didn't
     */
    assertSuccess(result: CliResult, operation: string = 'CLI operation'): void {
        if (result.exitCode !== 0) {
            const errorMessage = this.formatCliError(`${operation} failed`, result);
            throw new Error(errorMessage);
        }
    }

    /**
     * Execute command and assert success
     */
    async executeAndAssertSuccess(
        args: string[],
        operation: string,
        options?: {
            cwd?: string;
            env?: Record<string, string>;
            timeout?: number;
        },
    ): Promise<CliResult> {
        const result = await this.execute(args, options);
        this.assertSuccess(result, operation);
        return result;
    }

    /**
     * Log CLI result for debugging (always includes stderr if present)
     */
    logCliResult(operation: string, result: CliResult, logStdout: boolean = false): void {
        const parts = [`${operation}:`];

        if (result.exitCode !== 0) {
            parts.push(`❌ Exit code: ${result.exitCode}`);
        } else {
            parts.push(`✅ Success`);
        }

        if (logStdout && result.stdout) {
            parts.push(`STDOUT: ${result.stdout}`);
        }

        if (result.stderr) {
            parts.push(`STDERR: ${result.stderr}`);
        }

        console.log(parts.join('\n'));
    }

    /**
     * Get status of sequences
     */
    async getStatus(options: {
        organism: string;
        status?: string;
        result?: string;
        group?: number;
        accession?: string;
        version?: number;
        summary?: boolean;
        detailed?: boolean;
        format?: string;
        limit?: number;
        page?: number;
        errorsOnly?: boolean;
        warningsOnly?: boolean;
        ready?: boolean;
        pending?: boolean;
    }): Promise<CliResult> {
        const args = ['--organism', options.organism];

        if (options.group) {
            args.push('--group', options.group.toString());
        }

        args.push('status');

        if (options.status) {
            args.push('--status', options.status);
        }

        if (options.result) {
            args.push('--result', options.result);
        }

        if (options.accession) {
            args.push('--accession', options.accession);
        }

        if (options.version) {
            args.push('--version', options.version.toString());
        }

        if (options.summary) {
            args.push('--summary');
        }

        if (options.detailed) {
            args.push('--detailed');
        }

        if (options.format) {
            args.push('--format', options.format);
        }

        if (options.limit) {
            args.push('--limit', options.limit.toString());
        }

        if (options.page) {
            args.push('--page', options.page.toString());
        }

        if (options.errorsOnly) {
            args.push('--errors-only');
        }

        if (options.warningsOnly) {
            args.push('--warnings-only');
        }

        if (options.ready) {
            args.push('--ready');
        }

        if (options.pending) {
            args.push('--pending');
        }

        return this.execute(args);
    }

    /**
     * Release sequences
     */
    async releaseSequences(options: {
        organism: string;
        accession?: string;
        version?: number;
        group?: number;
        allValid?: boolean;
        noWarningsOnly?: boolean;
        filterStatus?: string;
        filterResult?: string;
        dryRun?: boolean;
        force?: boolean;
        quiet?: boolean;
        verbose?: boolean;
    }): Promise<CliResult> {
        const args = ['--organism', options.organism];

        if (options.group) {
            args.push('--group', options.group.toString());
        }

        args.push('release');

        if (options.accession) {
            args.push('--accession', options.accession);
        }

        if (options.version) {
            args.push('--version', options.version.toString());
        }

        if (options.allValid) {
            args.push('--all-valid');
        }

        if (options.noWarningsOnly) {
            args.push('--no-warnings-only');
        }

        if (options.filterStatus) {
            args.push('--filter-status', options.filterStatus);
        }

        if (options.filterResult) {
            args.push('--filter-result', options.filterResult);
        }

        if (options.dryRun) {
            args.push('--dry-run');
        }

        if (options.force) {
            args.push('--force');
        }

        if (options.quiet) {
            args.push('--quiet');
        }

        if (options.verbose) {
            args.push('--verbose');
        }

        return this.execute(args);
    }

    /**
     * Setup test data by submitting sequences
     */
    async setupTestData(options: {
        organism: string;
        group: number;
        numSequences?: number;
        withErrors?: boolean;
    }): Promise<{ submissionIds: string[]; accessions: string[] }> {
        const { organism, group, numSequences = 2, withErrors = false } = options;

        const timestamp = Date.now();
        const submissionIds: string[] = [];
        const accessions: string[] = [];

        for (let i = 1; i <= numSequences; i++) {
            const submissionId = `test_${timestamp}_${String(i).padStart(3, '0')}`;
            submissionIds.push(submissionId);

            // Create metadata
            const metadata =
                withErrors && i === numSequences
                    ? `id\tsampleCollectionDate\tgeoLocCountry\thostNameScientific\tauthors\tinvalid_field\n${submissionId}\t2024-01-${String(i).padStart(2, '0')}\tUSA\tHomo sapiens\tSmith, John\tinvalid_value`
                    : `id\tsampleCollectionDate\tgeoLocCountry\thostNameScientific\tauthors\n${submissionId}\t2024-01-${String(i).padStart(2, '0')}\tUSA\tHomo sapiens\tSmith, John`;

            // Create sequence
            const sequences = `>${submissionId}\nATCGATCGATCGATCGATCGATCG`;

            // Submit
            const submitResult = await this.submitSequences({
                organism,
                metadata,
                sequences,
                group,
            });

            if (submitResult.exitCode === 0) {
                // Try to extract accession from output, or use predictable format
                accessions.push(`LOC_${String(timestamp).slice(-6)}_${String(i).padStart(3, '0')}`);
            } else {
                // Log detailed error information for debugging
                const errorMessage = this.formatCliError(
                    `Failed to submit sequence ${i}/${numSequences}`,
                    submitResult,
                );
                throw new Error(errorMessage);
            }
        }

        // Wait a bit for processing to start
        await new Promise((resolve) => setTimeout(resolve, 2000));

        return { submissionIds, accessions };
    }
}

/**
 * Extended CLI page class for tests that need test-specific properties
 */
export class TestCliPage extends CliPage {
    public testGroupName?: string;
    public testGroupId?: number;
    public testAccount?: unknown;
}
