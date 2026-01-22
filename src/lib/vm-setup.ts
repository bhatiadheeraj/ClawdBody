/**
 * VM Setup Scripts
 * Commands to configure the Orgo VM with all required tools
 */

import { OrgoClient } from './orgo'

export interface SetupProgress {
  step: string
  message: string
  success: boolean
  output?: string
}

export class VMSetup {
  private orgo: OrgoClient
  private computerId: string
  private onProgress?: (progress: SetupProgress) => void

  constructor(
    orgo: OrgoClient,
    computerId: string,
    onProgress?: (progress: SetupProgress) => void
  ) {
    this.orgo = orgo
    this.computerId = computerId
    this.onProgress = onProgress
  }

  private async runCommand(command: string, step: string, retries: number = 2): Promise<{ output: string; success: boolean }> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.orgo.bash(this.computerId, command)
        const success = result.exit_code === 0
        
        this.onProgress?.({
          step,
          message: success ? `Completed: ${step}` : `Failed: ${step}`,
          success,
          output: result.output,
        })

        return { output: result.output, success }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        const message = lastError.message
        
        // If it's a 502 or connection error, wait and retry
        if (attempt < retries && (message.includes('502') || message.includes('Failed to execute') || message.includes('ECONNREFUSED'))) {
          const waitTime = (attempt + 1) * 2000 // Exponential backoff: 2s, 4s
          console.log(`Command failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${waitTime}ms...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
        
        this.onProgress?.({
          step,
          message: `Error: ${message}`,
          success: false,
        })
        return { output: message, success: false }
      }
    }
    
    // Should never reach here, but TypeScript needs it
    const message = lastError?.message || 'Unknown error'
    return { output: message, success: false }
  }

  /**
   * Generate SSH key pair for GitHub access
   */
  async generateSSHKey(): Promise<{ publicKey: string; success: boolean }> {
    // Ensure .ssh directory exists
    const mkdirResult = await this.runCommand(
      'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
      'Create .ssh directory'
    )
    
    if (!mkdirResult.success) {
      console.error('Failed to create .ssh directory:', mkdirResult.output)
      return { publicKey: '', success: false }
    }

    // Verify ssh-keygen is available (openssh-client should be installed)
    const checkSshKeygen = await this.runCommand(
      'which ssh-keygen || command -v ssh-keygen',
      'Check ssh-keygen availability'
    )
    
    if (!checkSshKeygen.success || !checkSshKeygen.output.trim()) {
      // Try to install openssh-client if not found
      console.log('ssh-keygen not found, installing openssh-client...')
      const installSsh = await this.runCommand(
        'sudo apt-get update -qq && sudo apt-get install -y -qq openssh-client',
        'Install openssh-client'
      )
      
      if (!installSsh.success) {
        console.error('Failed to install openssh-client:', installSsh.output)
        return { publicKey: '', success: false }
      }
    }

    // Remove existing key if it exists (we want a fresh key)
    await this.runCommand(
      'rm -f ~/.ssh/id_ed25519 ~/.ssh/id_ed25519.pub',
      'Remove existing SSH key if present'
    )
    
    // Generate SSH key
    const keyGen = await this.runCommand(
      'ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "samantha-vm"',
      'Generate SSH key'
    )
    
    if (!keyGen.success) {
      console.error('Failed to generate SSH key:', keyGen.output)
      return { publicKey: '', success: false }
    }

    // Get public key
    const pubKey = await this.runCommand('cat ~/.ssh/id_ed25519.pub', 'Read public key')
    
    if (!pubKey.success || !pubKey.output.trim()) {
      console.error('Failed to read public key:', pubKey.output)
      return { publicKey: '', success: false }
    }

    return { 
      publicKey: pubKey.output.trim(), 
      success: true 
    }
  }

  /**
   * Configure Git with user info
   */
  async configureGit(username: string, email: string): Promise<boolean> {
    const commands = [
      `git config --global user.name "${username}"`,
      `git config --global user.email "${email}"`,
      'git config --global init.defaultBranch main',
      // Add GitHub to known hosts
      'mkdir -p ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null',
    ]

    for (const cmd of commands) {
      const result = await this.runCommand(cmd, 'Configure Git')
      if (!result.success) return false
    }

    return true
  }

  /**
   * Clone the vault repository
   */
  async cloneVaultRepo(sshUrl: string): Promise<boolean> {
    // Create vault directory and clone
    const result = await this.runCommand(
      `rm -rf ~/vault && git clone ${sshUrl} ~/vault`,
      'Clone vault repository'
    )
    
    return result.success
  }

  /**
   * Clone additional repositories
   */
  async cloneRepositories(repos: Array<{ name: string; sshUrl: string }>): Promise<{ success: boolean; errors?: Array<{ repo: string; error: string }> }> {
    const errors: Array<{ repo: string; error: string }> = []
    const baseDir = '~/repositories'
    
    // Create repositories directory if it doesn't exist
    await this.runCommand(`mkdir -p ${baseDir}`, 'Create repositories directory')
    
    for (const repo of repos) {
      const repoPath = `${baseDir}/${repo.name}`
      
      // Remove if exists and clone
      const result = await this.runCommand(
        `rm -rf ${repoPath} && git clone ${repo.sshUrl} ${repoPath}`,
        `Clone repository: ${repo.name}`
      )
      
      if (!result.success) {
        errors.push({ repo: repo.name, error: result.output })
      }
    }
    
    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Wait for VM to be ready by testing a simple command
   */
  private async waitForVMReady(maxRetries: number = 10, delayMs: number = 3000): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await this.orgo.bash(this.computerId, 'echo "ready"')
        if (result.exit_code === 0) {
          return true
        }
      } catch (error) {
        // VM not ready yet, continue waiting
      }
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    return false
  }

  /**
   * Install Python, Git, SSH and other essential tools
   */
  async installPython(): Promise<boolean> {
    // Wait for VM to be ready first
    console.log('Waiting for VM to be ready...')
    const vmReady = await this.waitForVMReady(15, 5000) // 15 retries, 5 seconds apart = up to 75 seconds
    if (!vmReady) {
      console.error('VM did not become ready after waiting')
      return false
    }

    // Retry logic for installation commands
    const commands = [
      'apt-get update -qq',
      // Install python3, git, and openssh-client (provides ssh-keygen)
      'apt-get install -y -qq python3 python3-pip python3-venv git openssh-client procps',
    ]

    for (const cmd of commands) {
      let retries = 3
      let success = false
      
      while (retries > 0 && !success) {
        const result = await this.runCommand(`sudo ${cmd}`, 'Install Python')
        if (result.success) {
          success = true
        } else {
          retries--
          if (retries > 0) {
            console.log(`Command failed, retrying in 3 seconds... (${retries} retries left)`)
            await new Promise(resolve => setTimeout(resolve, 3000))
          }
        }
      }
      
      if (!success) {
        console.error(`Failed to execute: ${cmd}`)
        return false
      }
    }

    return true
  }

  /**
   * Install Anthropic Python SDK for AI capabilities
   * Note: We use Orgo's REST API directly (not Python SDK) to avoid bugs
   */
  async installOrgoPythonSDK(): Promise<boolean> {
    // Install anthropic SDK, Pillow (for image compression), and requests - we use Orgo REST API directly
    const result = await this.runCommand(
      'pip3 install anthropic langchain-anthropic requests Pillow --break-system-packages',
      'Install Anthropic SDK and dependencies'
    )
    
    if (!result.success) {
      console.warn(`Warning installing SDK: ${result.output}`)
    }

    // Verify installation
    const verify = await this.runCommand(
      'python3 -c "import anthropic; import PIL; print(\'Anthropic SDK and Pillow installed\')"',
      'Verify SDK installation'
    )

    if (!verify.success) {
      this.onProgress?.({
        step: 'Install SDKs',
        message: 'SDK installation had issues, continuing...',
        success: true,
      })
    }

    return true
  }

  /**
   * Install browser-use library
   * Docs: https://docs.browser-use.com
   * Note: Uses background execution due to Orgo's 30s timeout
   */
  async installBrowserUse(): Promise<boolean> {
    // Create a script that does all the installation
    const installScript = `#!/bin/bash
set -e
echo "Starting browser-use installation..." > /tmp/browser-use-install.log

# Create virtual environment
python3 -m venv ~/browser-use-env 2>&1 | tee -a /tmp/browser-use-install.log

# Install browser-use and playwright
~/browser-use-env/bin/pip install browser-use playwright 2>&1 | tee -a /tmp/browser-use-install.log

# Install chromium browser
~/browser-use-env/bin/playwright install chromium 2>&1 | tee -a /tmp/browser-use-install.log

# Install system dependencies
sudo ~/browser-use-env/bin/playwright install-deps chromium 2>&1 | tee -a /tmp/browser-use-install.log

echo "INSTALL_COMPLETE" >> /tmp/browser-use-install.log
`

    // Write the install script
    const writeScript = await this.runCommand(
      `cat > /tmp/install-browser-use.sh << 'SCRIPT_EOF'
${installScript}
SCRIPT_EOF
chmod +x /tmp/install-browser-use.sh`,
      'Create browser-use install script'
    )

    if (!writeScript.success) {
      return false
    }

    // Run the script in the background
    await this.runCommand(
      'nohup /tmp/install-browser-use.sh > /tmp/browser-use-install-out.log 2>&1 &',
      'Start browser-use installation (background)'
    )

    // Poll for completion (check every 10 seconds, up to 5 minutes)
    const maxAttempts = 30
    const intervalMs = 10000

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs))
      
      const checkResult = await this.runCommand(
        'grep -q "INSTALL_COMPLETE" /tmp/browser-use-install.log 2>/dev/null && echo "DONE" || echo "PENDING"',
        'Check browser-use installation progress'
      )

      if (checkResult.output.trim() === 'DONE') {
        this.onProgress?.({
          step: 'Install browser-use',
          message: 'browser-use installation completed',
          success: true,
        })
        
        // Verify installation
        const verify = await this.runCommand(
          '~/browser-use-env/bin/python -c "import browser_use; print(\'browser-use installed\')"',
          'Verify browser-use'
        )
        return verify.success
      }

      this.onProgress?.({
        step: 'Install browser-use',
        message: `Installing browser-use... (${i + 1}/${maxAttempts})`,
        success: true,
      })
    }

    // Timed out - check if there was an error
    const logResult = await this.runCommand(
      'tail -20 /tmp/browser-use-install.log',
      'Get browser-use install log'
    )
    console.warn('browser-use installation timed out. Last log:', logResult.output)
    
    return false
  }

  /**
   * Set up Git sync service
   * Automatically pulls changes from GitHub periodically
   * Uses cron or background process (systemd not available on Orgo VMs)
   */
  async setupGitSync(): Promise<boolean> {
    // Create sync script that pulls from GitHub
    const syncScript = `#!/bin/bash
cd ~/vault
git fetch origin main
git reset --hard origin/main
`
    
    const createScript = await this.runCommand(
      `cat > ~/sync-vault.sh << 'EOF'
${syncScript}
EOF
chmod +x ~/sync-vault.sh`,
      'Create sync script'
    )

    if (!createScript.success) return false

    // Create a background sync daemon script
    const daemonScript = `#!/bin/bash
# Vault sync daemon - runs every 60 seconds
LOG_FILE=~/vault-sync.log

echo "[$(date)] Vault sync daemon starting..." >> $LOG_FILE

while true; do
    ~/sync-vault.sh >> $LOG_FILE 2>&1
    echo "[$(date)] Sync completed" >> $LOG_FILE
    sleep 60
done
`

    const createDaemon = await this.runCommand(
      `cat > ~/vault-sync-daemon.sh << 'EOF'
${daemonScript}
EOF
chmod +x ~/vault-sync-daemon.sh`,
      'Create sync daemon script'
    )

    if (!createDaemon.success) return false

    // Try cron first (preferred)
    const cronResult = await this.runCommand(
      '(crontab -l 2>/dev/null | grep -v "sync-vault.sh"; echo "* * * * * /root/sync-vault.sh >> /root/vault-sync.log 2>&1") | crontab -',
      'Setup cron job for vault sync'
    )

    if (cronResult.success) {
      this.onProgress?.({
        step: 'Git Sync',
        message: 'Vault sync configured via cron (every 1 minute)',
        success: true,
      })
      return true
    }

    // Fallback: start background daemon
    this.onProgress?.({
      step: 'Git Sync',
      message: 'Cron not available, starting background sync daemon',
      success: true,
    })

    const startDaemon = await this.runCommand(
      'nohup ~/vault-sync-daemon.sh > /dev/null 2>&1 &',
      'Start vault sync daemon'
    )

    return startDaemon.success
  }

  /**
   * Set up Ralph Wiggum - Autonomous AI Task Executor
   * Uses Orgo SDK for computer use and browser-use for web automation
   * Can infer tasks from vault when tasks.md is empty (P1/P2)
   */
  async setupRalphWiggum(claudeApiKey: string, orgoApiKey: string, computerId: string): Promise<boolean> {
    // Download Ralph Wiggum script from GitHub Gist (hosted externally to avoid command size limits)
    const RALPH_GIST_URL = 'https://gist.githubusercontent.com/Prakshal-Jain/660d4b056a0f2554a663a171fda40c9f/raw/ralph_wiggum.py'
    
    this.onProgress?.({
      step: 'Ralph Wiggum',
      message: 'Downloading task executor script...',
      success: true,
    })
    
    const downloadResult = await this.runCommand(
      `curl -fsSL "${RALPH_GIST_URL}" -o ~/ralph_wiggum.py && chmod +x ~/ralph_wiggum.py`,
      'Download Ralph Wiggum script'
    )
    
    if (!downloadResult.success) {
      console.error('Failed to download Ralph Wiggum script:', downloadResult.output)
      return false
    }
    
    // Verify the script was downloaded
    const verifyResult = await this.runCommand(
      'head -5 ~/ralph_wiggum.py',
      'Verify script download'
    )
    
    if (!verifyResult.success || !verifyResult.output.includes('Ralph Wiggum')) {
      console.error('Script verification failed:', verifyResult.output)
      return false
    }
    
    this.onProgress?.({
      step: 'Ralph Wiggum',
      message: 'Script downloaded successfully',
      success: true,
    })

    // Create wrapper script with environment variables and auto-restart
    // Note: Only one instance should run at a time (Ralph has its own lock file)
    const wrapperScript = `#!/bin/bash
# Ralph Wiggum wrapper - runs with auto-restart on failure
export ANTHROPIC_API_KEY="${claudeApiKey}"
export ORGO_API_KEY="${orgoApiKey}"
export ORGO_COMPUTER_ID="${computerId}"

# Ensure we're in home directory
cd ~

while true; do
    # Check if another instance is already running (via lock file or process)
    if [ -f /tmp/ralph_task.lock ]; then
        echo "[$(date)] Lock file exists, waiting..." >> ~/ralph_wiggum.log
        sleep 30
        continue
    fi
    
    echo "[$(date)] Starting Ralph Wiggum (Samantha Task Executor)..." >> ~/ralph_wiggum.log
    python3 ~/ralph_wiggum.py
    EXIT_CODE=$?
    echo "[$(date)] Ralph Wiggum exited with code $EXIT_CODE, restarting in 10s..." >> ~/ralph_wiggum.log
    sleep 10
done
`

    const createWrapper = await this.runCommand(
      `cat > ~/start-ralph.sh << 'WRAPPER_EOF'
${wrapperScript}
WRAPPER_EOF
chmod +x ~/start-ralph.sh`,
      'Create Ralph Wiggum wrapper script'
    )

    if (!createWrapper.success) return false

    // Start Ralph Wiggum as background process
    // First, cleanup any existing instances (optional - can fail silently)
    // Use separate simple commands to avoid parsing issues
    // These commands will succeed even if processes don't exist (|| true ensures exit code 0)
    const cleanup1 = await this.runCommand(
      'pkill -f start-ralph.sh 2>/dev/null || true',
      'Cleanup existing Ralph processes'
    )
    const cleanup2 = await this.runCommand(
      'pkill -f ralph_wiggum.py 2>/dev/null || true',
      'Cleanup existing Ralph processes'
    )
    // Ignore results - cleanup is optional and might not find processes
    
    // Remove lock file if it exists (also optional)
    await this.runCommand(
      'rm -f /tmp/ralph_task.lock 2>/dev/null || true',
      'Remove lock file'
    )
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Start Ralph (simple command like other working background processes)
    const startRalph = await this.runCommand(
      'nohup ~/start-ralph.sh > /dev/null 2>&1 &',
      'Start Ralph Wiggum (background)'
    )

    if (startRalph.success) {
      this.onProgress?.({
        step: 'Ralph Wiggum',
        message: 'Samantha Task Executor started with full computer use capabilities',
        success: true,
      })
    }

    return startRalph.success
  }


  /**
   * Store Claude API key securely
   */
  async storeClaudeKey(apiKey: string): Promise<boolean> {
    const result = await this.runCommand(
      `echo 'export ANTHROPIC_API_KEY="${apiKey}"' >> ~/.bashrc`,
      'Store Claude API key'
    )
    return result.success
  }

  /**
   * Run full setup sequence
   */
  async runFullSetup(options: {
    githubUsername: string
    githubEmail: string
    repoSshUrl: string
    claudeApiKey: string
    orgoApiKey: string
    computerId: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Install Python
      this.onProgress?.({ step: 'python', message: 'Installing Python...', success: true })
      const pythonOk = await this.installPython()
      if (!pythonOk) throw new Error('Failed to install Python')

      // 2. Install Orgo and Anthropic SDKs
      this.onProgress?.({ step: 'sdk', message: 'Installing AI SDKs...', success: true })
      const sdkOk = await this.installOrgoPythonSDK()
      if (!sdkOk) console.warn('SDK installation had issues, continuing...')

      // 3. Generate SSH key
      this.onProgress?.({ step: 'ssh', message: 'Generating SSH key...', success: true })
      const { publicKey, success: sshOk } = await this.generateSSHKey()
      if (!sshOk) throw new Error('Failed to generate SSH key')

      // 4. Configure Git
      this.onProgress?.({ step: 'git', message: 'Configuring Git...', success: true })
      const gitOk = await this.configureGit(options.githubUsername, options.githubEmail)
      if (!gitOk) throw new Error('Failed to configure Git')

      // 5. Clone vault (this will need the deploy key to be added first)
      // The calling code should add the deploy key before calling clone
      this.onProgress?.({ step: 'clone', message: 'Cloning vault repository...', success: true })
      const cloneOk = await this.cloneVaultRepo(options.repoSshUrl)
      if (!cloneOk) throw new Error('Failed to clone vault repository')

      // 6. Install browser-use
      this.onProgress?.({ step: 'browser-use', message: 'Installing browser-use...', success: true })
      const browserOk = await this.installBrowserUse()
      if (!browserOk) throw new Error('Failed to install browser-use')

      // 7. Set up Git sync
      this.onProgress?.({ step: 'sync', message: 'Setting up Git sync...', success: true })
      const syncOk = await this.setupGitSync()
      if (!syncOk) throw new Error('Failed to set up Git sync')

      // 8. Store Claude API key
      this.onProgress?.({ step: 'claude', message: 'Storing Claude API key...', success: true })
      const claudeOk = await this.storeClaudeKey(options.claudeApiKey)
      if (!claudeOk) throw new Error('Failed to store Claude API key')

      // 9. Set up Ralph Wiggum (Samantha Task Executor)
      this.onProgress?.({ step: 'ralph', message: 'Setting up Samantha Task Executor...', success: true })
      const ralphOk = await this.setupRalphWiggum(options.claudeApiKey, options.orgoApiKey, options.computerId)
      if (!ralphOk) throw new Error('Failed to set up Samantha Task Executor')

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  }

  /**
   * Get the public SSH key from the VM
   */
  async getPublicKey(): Promise<string> {
    const result = await this.runCommand('cat ~/.ssh/id_ed25519.pub', 'Get public key')
    return result.output.trim()
  }
}


