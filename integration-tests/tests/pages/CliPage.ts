import { exec, execFile } from 'child_process';
import { promisify, stripVTControlCharacters } from 'util';
import { writeFile, unlink, rm } from 'fs/promises';
import { delimiter, join, resolve } from 'path';
import { tmpdir } from 'os';
import { Page, test } from '@playwright/test';
import { randomUUID } from 'crypto';
import { AuthPage } from './auth.page';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const LOCAL_TEST_DOMAIN_SUFFIX = '.loculus.test';

export interface CliResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    command?: string;
    timestamp?: string;
    duration?: number;
}

export class CliPage {
    private baseUrl: string;
    private keyringService: string;
    private configFile: string;
    private dataHome: string;
    private localCliSource: string;
    private keyringPython?: string;

    constructor(private page?: Page) {
        const uuid = randomUUID();
        // Get base URL from environment or default to localhost
        this.baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
        // Generate a unique keyring service name for this test instance
        this.keyringService = `loculus-cli-test-${uuid}`;
        // Generate a unique config file for this test instance
        this.configFile = join(tmpdir(), `loculus-cli-test-config-${uuid}.yml`);
        // Generate a unique data directory for this test instance to isolate keyring storage.
        // The PlaintextKeyring backend stores all entries in a single shared file under
        // XDG_DATA_HOME. Without isolation, parallel tests perform concurrent read-modify-write
        // on that file, causing race conditions that silently clobber each other's tokens.
        this.dataHome = join(tmpdir(), `loculus-cli-test-data-${uuid}`);
        this.localCliSource = resolve(__dirname, '../../..', 'cli/src');
    }

    private commandEnv(env: Record<string, string> = {}): NodeJS.ProcessEnv {
        const pythonPath = [this.localCliSource, env.PYTHONPATH ?? process.env.PYTHONPATH]
            .filter(Boolean)
            .join(delimiter);

        return {
            ...process.env,
            ...env,
            // Extract instance from base URL
            LOCULUS_INSTANCE: this.baseUrl.replace(/https?:\/\//, ''),
            // Use unique keyring service for test isolation (stable per test instance)
            LOCULUS_CLI_KEYRING_SERVICE: this.keyringService,
            // Use unique config file for test isolation
            LOCULUS_CONFIG: this.configFile,
            // Use unique data directory so each test gets its own keyring file
            XDG_DATA_HOME: this.dataHome,
            // Route .loculus.test through localhost for spawned Python CLI processes.
            LOCULUS_CLI_LOCAL_TEST_DNS: '1',
            LOCULUS_CLI_ALLOW_INSECURE_LOCAL_TEST_TLS: '1',
            // Run the CLI from this checkout so integration tests exercise local edits.
            PYTHONPATH: pythonPath,
            // Disable interactive features like spinners
            CI: 'true',
            NO_COLOR: '1',
        };
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

        const cmdEnv = this.commandEnv(env);

        const command = `loculus ${args.join(' ')}`;
        const timestamp = new Date().toISOString();
        const startTime = Date.now();

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd,
                env: cmdEnv,
                timeout,
            });

            const duration = Date.now() - startTime;
            const result: CliResult = {
                stdout: stripVTControlCharacters(stdout.trim()),
                stderr: stripVTControlCharacters(stderr.trim()),
                exitCode: 0,
                command,
                timestamp,
                duration,
            };

            // Attach outputs to Playwright test info for better debugging
            this.attachToTest(result);

            return result;
        } catch (error: unknown) {
            const execError = error as {
                stdout?: string;
                stderr?: string;
                message?: string;
                code?: number;
            };

            const duration = Date.now() - startTime;
            const result: CliResult = {
                stdout: stripVTControlCharacters(execError.stdout?.trim() || ''),
                stderr: stripVTControlCharacters(
                    execError.stderr?.trim() || execError.message || '',
                ),
                exitCode: execError.code || 1,
                command,
                timestamp,
                duration,
            };

            // Attach outputs to Playwright test info for better debugging
            this.attachToTest(result);

            return result;
        }
    }

    /**
     * Attach CLI result to Playwright test info for better debugging
     */
    private attachToTest(result: CliResult): void {
        try {
            const testInfo = test.info();
            if (!testInfo) {
                return;
            }

            // Create a detailed log of the CLI execution
            const logContent = [
                `Command: ${result.command}`,
                `Timestamp: ${result.timestamp}`,
                `Duration: ${result.duration}ms`,
                `Exit Code: ${result.exitCode}`,
                '',
                '=== STDOUT ===',
                result.stdout || '(empty)',
                '',
                '=== STDERR ===',
                result.stderr || '(empty)',
            ].join('\n');

            // Attach as text file
            testInfo
                .attach(`cli-${result.timestamp}`, {
                    body: logContent,
                    contentType: 'text/plain',
                })
                .catch(() => {
                    console.warn('Failed to attach CLI log to test info');
                });

            // For failed commands, also attach with a more prominent name
            if (result.exitCode !== 0) {
                testInfo
                    .attach(`cli-FAILED-${result.command?.split(' ')[0] || 'unknown'}`, {
                        body: logContent,
                        contentType: 'text/plain',
                    })
                    .catch(() => {
                        console.warn('Failed to attach CLI log to test info');
                    });
            }
        } catch {
            // Silently ignore if test.info() is not available (e.g., outside test context)
        }
    }

    /**
     * Create a temporary file with the given content
     */
    async createTempFile(content: string, suffix: string = '.tmp'): Promise<string> {
        const filename = `cli-test-${randomUUID()}${suffix}`;
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

        // Clean up unique data directory (contains isolated keyring file)
        try {
            await rm(this.dataHome, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
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
        if (this.page) {
            return this.loginWithBrowserToken(username, password);
        }
        return this.execute(['auth', 'login', '--username', username, '--password', password]);
    }

    private async loginWithBrowserToken(username: string, password: string): Promise<CliResult> {
        const page = this.page;
        if (!page) {
            return this.execute(['auth', 'login', '--username', username, '--password', password]);
        }
        const timestamp = new Date().toISOString();
        const startTime = Date.now();

        try {
            await page.context().clearCookies();
            const authPage = new AuthPage(page);
            const loggedIn = await authPage.login(username, password);
            if (!loggedIn) {
                return this.cliResult({
                    exitCode: 1,
                    stdout: '',
                    stderr: 'Invalid username or password',
                    command: 'browser-backed loculus auth login',
                    timestamp,
                    startTime,
                });
            }

            const cookies = await page.context().cookies(this.baseUrl);
            const accessToken = cookies.find((cookie) => cookie.name === 'access_token')?.value;
            if (!accessToken) {
                throw new Error('Browser login did not produce an access_token cookie');
            }
            const tokenUsername = this.usernameFromToken(accessToken);
            if (tokenUsername !== username) {
                return this.cliResult({
                    exitCode: 1,
                    stdout: '',
                    stderr: 'Invalid username or password',
                    command: 'browser-backed loculus auth login',
                    timestamp,
                    startTime,
                });
            }

            await this.seedToken(username, accessToken);
            return this.cliResult({
                exitCode: 0,
                stdout: `✓ Successfully logged in as ${username}`,
                stderr: '',
                command: 'browser-backed loculus auth login',
                timestamp,
                startTime,
            });
        } catch (error) {
            return this.cliResult({
                exitCode: 1,
                stdout: '',
                stderr: error instanceof Error ? error.message : String(error),
                command: 'browser-backed loculus auth login',
                timestamp,
                startTime,
            });
        }
    }

    private async seedToken(username: string, accessToken: string): Promise<void> {
        const instanceInfo = await this.fetchInstanceInfo();
        const autheliaUrl = instanceInfo.hosts.authelia;
        const script = `
import json
import os
import time

import keyring

service = os.environ["LOCULUS_CLI_KEYRING_SERVICE"]
username = os.environ["LOCULUS_CLI_SEED_USERNAME"]
authelia_url = os.environ["LOCULUS_CLI_SEED_AUTHELIA_URL"]
access_token = os.environ["LOCULUS_CLI_SEED_ACCESS_TOKEN"]

token_info = {
    "access_token": access_token,
    "refresh_token": None,
    "expires_in": 3600,
    "refresh_expires_in": 0,
    "token_type": "Bearer",
    "id_token": access_token,
    "subject": username,
    "created_at": time.time(),
}

keyring.set_password(service, f"{authelia_url}#{username}", json.dumps(token_info))
keyring.set_password(service, "current_user", username)
`;

        await execFileAsync(await this.getKeyringPython(), ['-c', script], {
            env: this.commandEnv({
                LOCULUS_CLI_SEED_USERNAME: username,
                LOCULUS_CLI_SEED_AUTHELIA_URL: autheliaUrl,
                LOCULUS_CLI_SEED_ACCESS_TOKEN: accessToken,
            }),
            timeout: 10000,
        });
    }

    private async getKeyringPython(): Promise<string> {
        if (this.keyringPython) {
            return this.keyringPython;
        }

        const candidates = [
            process.env.LOCULUS_CLI_KEYRING_PYTHON,
            'python3',
            '/usr/bin/python3',
        ].filter((candidate): candidate is string => Boolean(candidate));

        const errors: string[] = [];
        for (const candidate of candidates) {
            try {
                await execFileAsync(candidate, ['-c', 'import keyring'], {
                    env: this.commandEnv(),
                    timeout: 10000,
                });
                this.keyringPython = candidate;
                return candidate;
            } catch (error: unknown) {
                const execError = error as { stderr?: string; message?: string };
                errors.push(
                    `${candidate}: ${execError.stderr?.trim() || execError.message || 'failed'}`,
                );
            }
        }

        throw new Error(`No Python interpreter with keyring is available (${errors.join('; ')})`);
    }

    private async fetchInstanceInfo(): Promise<{ hosts: { authelia: string } }> {
        const url = new URL('/loculus-info', this.baseUrl);
        const headers: Record<string, string> = {};

        if (url.hostname === 'loculus.test' || url.hostname.endsWith(LOCAL_TEST_DOMAIN_SUFFIX)) {
            headers.Host = url.host;
            url.hostname = '127.0.0.1';
        }

        if (!this.page) {
            throw new Error('Browser-backed CLI login requires a Playwright page');
        }

        const response = await this.page.request.get(url.toString(), { headers });
        if (!response.ok()) {
            throw new Error(`Failed to fetch instance info: HTTP ${response.status()}`);
        }
        return (await response.json()) as { hosts: { authelia: string } };
    }

    private usernameFromToken(token: string): string | undefined {
        const [, payload] = token.split('.');
        if (!payload) {
            return undefined;
        }
        const paddedPayload = payload.padEnd(
            payload.length + ((4 - (payload.length % 4)) % 4),
            '=',
        );
        const claims = JSON.parse(Buffer.from(paddedPayload, 'base64url').toString('utf8')) as {
            preferred_username?: string;
            sub?: string;
        };
        return claims.preferred_username ?? claims.sub;
    }

    private cliResult(input: {
        exitCode: number;
        stdout: string;
        stderr: string;
        command: string;
        timestamp: string;
        startTime: number;
    }): CliResult {
        const result = {
            stdout: stripVTControlCharacters(input.stdout.trim()),
            stderr: stripVTControlCharacters(input.stderr.trim()),
            exitCode: input.exitCode,
            command: input.command,
            timestamp: input.timestamp,
            duration: Date.now() - input.startTime,
        };
        this.attachToTest(result);
        return result;
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
