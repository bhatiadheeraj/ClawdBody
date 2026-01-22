/**
 * Orgo API Client
 * Handles VM provisioning and management
 * API Docs: https://docs.orgo.ai
 */

const ORGO_API_BASE = 'https://www.orgo.ai/api'

export interface OrgoComputer {
  id: string
  name: string
  project_name: string
  os: string
  ram: number
  cpu: number
  status: string
  url: string
  created_at: string
}

export interface OrgoProject {
  id: string
  name: string
}

export class OrgoClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${ORGO_API_BASE}${endpoint}`
    console.log(`[Orgo API] ${options.method || 'GET'} ${url}`)
    
    // Add timeout to fetch requests (60 seconds for long operations like computer creation)
    const timeoutMs = 60000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })
      
      clearTimeout(timeoutId)

      const responseText = await response.text()
      console.log(`[Orgo API] Response ${response.status}: ${responseText.substring(0, 200)}`)

      if (!response.ok) {
        let errorMessage = `Orgo API error: ${response.status}`
        try {
          const errorJson = JSON.parse(responseText)
          errorMessage = errorJson.error || errorJson.message || errorMessage
        } catch {
          errorMessage = responseText || errorMessage
        }
        throw new Error(errorMessage)
      }

      try {
        return JSON.parse(responseText)
      } catch {
        return responseText as T
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError' || error.code === 'ETIMEDOUT') {
        throw new Error(`Request to Orgo API timed out after ${timeoutMs}ms. The operation may still be in progress.`)
      }
      throw error
    }
  }

  /**
   * Get or create a project by name
   * Note: Projects are created implicitly when creating a computer
   */
  async getOrCreateProject(name: string): Promise<OrgoProject> {
    // List existing projects first
    const projects = await this.listProjects()
    const existing = projects.find(p => p.name === name)
    if (existing) {
      return existing
    }
    // Project will be created when we create the first computer
    // Return a placeholder that will be updated after computer creation
    return { id: '', name }
  }

  /**
   * List all projects
   */
  async listProjects(): Promise<OrgoProject[]> {
    const response = await this.request<{ projects: OrgoProject[] }>('/projects')
    return response.projects || []
  }

  /**
   * Create a new computer (VM) within a project
   * Uses POST /computers with project_id in the body
   */
  async createComputer(
    projectId: string,
    computerName: string,
    options: {
      os?: 'linux' | 'windows'
      ram?: 1 | 2 | 4 | 8 | 16 | 32 | 64
      cpu?: 1 | 2 | 4 | 8 | 16
    } = {}
  ): Promise<OrgoComputer> {
    return this.request<OrgoComputer>('/computers', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        name: computerName,
        os: options.os || 'linux',
        ram: options.ram || 4,
        cpu: options.cpu || 2,
      }),
    })
  }

  /**
   * Get computer details by ID
   */
  async getComputer(computerId: string): Promise<OrgoComputer> {
    return this.request<OrgoComputer>(`/computers/${computerId}`)
  }

  /**
   * List all computers in a project
   */
  async listComputers(projectName: string): Promise<OrgoComputer[]> {
    const response = await this.request<{ computers: OrgoComputer[] }>(
      `/projects/${encodeURIComponent(projectName)}/computers`
    )
    return response.computers || []
  }

  /**
   * Start a computer
   */
  async startComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${computerId}/start`, { method: 'POST' })
  }

  /**
   * Stop a computer
   */
  async stopComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${computerId}/stop`, { method: 'POST' })
  }

  /**
   * Restart a computer
   */
  async restartComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${computerId}/restart`, { method: 'POST' })
  }

  /**
   * Delete a computer
   */
  async deleteComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${computerId}`, { method: 'DELETE' })
  }

  /**
   * Execute a bash command on the computer
   */
  async bash(computerId: string, command: string): Promise<{ output: string; exit_code: number }> {
    return this.request(`/computers/${computerId}/bash`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    })
  }

  /**
   * Execute Python code on the computer
   */
  async exec(computerId: string, code: string): Promise<{ output: string }> {
    return this.request(`/computers/${computerId}/exec`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  }

  /**
   * Take a screenshot of the computer
   */
  async screenshot(computerId: string): Promise<{ image: string }> {
    return this.request(`/computers/${computerId}/screenshot`)
  }

  /**
   * Wait for computer to be ready
   */
  async waitForReady(computerId: string, maxAttempts = 30, intervalMs = 2000): Promise<OrgoComputer> {
    for (let i = 0; i < maxAttempts; i++) {
      const computer = await this.getComputer(computerId)
      if (computer.status === 'running') {
        return computer
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    throw new Error('Computer did not become ready in time')
  }
}

/**
 * Generate a random computer name
 */
export function generateComputerName(): string {
  const adjectives = ['swift', 'bright', 'calm', 'bold', 'keen', 'wise', 'warm', 'cool']
  const nouns = ['fox', 'owl', 'wolf', 'hawk', 'bear', 'lion', 'deer', 'crow']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 1000)
  return `${adj}-${noun}-${num}`
}


