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

  constructor() {
    // Get base URL from environment or default to localhost
    this.baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
    // Generate a unique keyring service name for this test instance
    this.keyringService = `loculus-cli-test-${process.pid}-${Date.now()}`;
  }

  /**
   * Execute a CLI command with the given arguments
   */
  async execute(args: string[], options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  }): Promise<CliResult> {
    const { cwd, env = {}, timeout = 30000 } = options || {};

    // Set up environment variables
    const cmdEnv = {
      ...process.env,
      ...env,
      // Extract instance from base URL
      LOCULUS_INSTANCE: this.baseUrl.replace(/https?:\/\//, ''),
      // Use unique keyring service for test isolation (stable per test instance)
      LOCULUS_CLI_KEYRING_SERVICE: this.keyringService,
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
    } catch (error: any) {
      return {
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        exitCode: error.code || 1,
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
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Clean up any existing CLI state
   */
  async cleanup(): Promise<void> {
    // Clear authentication state (ignore errors)
    await this.logout();
    
    // Could also clear config if needed, but we'll reconfigure anyway
  }

  /**
   * Configure the CLI for testing
   */
  async configure(instance?: string): Promise<void> {
    const instanceUrl = instance || this.baseUrl.replace(/https?:\/\//, '');
    
    // Clear any existing authentication state first
    await this.cleanup();
    
    // Set default instance
    await this.execute(['config', 'set', 'default_instance', instanceUrl]);
    
    // Set output format to JSON for easier testing
    await this.execute(['config', 'set', 'output.format', 'json']);
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
    const args = ['submit', 'sequences'];
    
    // Create temporary files
    const metadataFile = await this.createTempFile(options.metadata, '.tsv');
    const sequencesFile = await this.createTempFile(options.sequences, '.fasta');
    
    try {
      args.push('--metadata', metadataFile);
      args.push('--sequences', sequencesFile);
      args.push('--organism', options.organism);
      
      if (options.group) {
        args.push('--group', options.group.toString());
      }
      
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
    const args = ['get', 'sequences', '--organism', options.organism];
    
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
    const args = ['submit', 'template', '--organism', organism];
    
    if (output) {
      args.push('--output', output);
    }
    
    return this.execute(args);
  }

  /**
   * Parse JSON output from CLI
   */
  parseJsonOutput(result: CliResult): any {
    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`Failed to parse JSON output: ${result.stdout}`);
    }
  }
}