import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'
import { OrgoClient } from '@/lib/orgo'
import { VMSetup } from '@/lib/vm-setup'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's setup state to find vault repo
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState?.vaultRepoName) {
      return NextResponse.json(
        { error: 'Vault repository not found. Please complete setup first.' },
        { status: 400 }
      )
    }

    // Get GitHub access token
    const githubAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: 'github' },
    })

    if (!githubAccount?.access_token) {
      return NextResponse.json(
        { error: 'GitHub account not connected' },
        { status: 400 }
      )
    }

    const githubClient = new GitHubClient(githubAccount.access_token)
    
    // List all repositories excluding the vault repo
    const repos = await githubClient.listRepositories(setupState.vaultRepoName)

    return NextResponse.json({ 
      success: true,
      repositories: repos
    })

  } catch (error: any) {
    console.error('GitHub connect error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch repositories' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { selectedRepos } = body

    if (!selectedRepos || !Array.isArray(selectedRepos) || selectedRepos.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one repository' },
        { status: 400 }
      )
    }

    // Get user's setup state to find vault repo and VM info
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState?.vaultRepoName) {
      return NextResponse.json(
        { error: 'Vault repository not found. Please complete setup first.' },
        { status: 400 }
      )
    }

    const hasVM = !!setupState.orgoComputerId

    // Get GitHub access token
    const githubAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: 'github' },
    })

    if (!githubAccount?.access_token) {
      return NextResponse.json(
        { error: 'GitHub account not connected' },
        { status: 400 }
      )
    }

    const githubClient = new GitHubClient(githubAccount.access_token)

    // Get all repos again to get SSH URLs for selected ones
    const allRepos = await githubClient.listRepositories(setupState.vaultRepoName)
    const reposToClone = allRepos.filter(repo => 
      selectedRepos.includes(repo.full_name)
    )

    if (reposToClone.length === 0) {
      return NextResponse.json(
        { error: 'No valid repositories found to clone' },
        { status: 400 }
      )
    }

    // Clone repositories on VM if VM exists, otherwise store them as pending
    let cloneResult: { success: boolean; errors?: Array<{ repo: string; error: string }> } | null = null
    
    if (hasVM) {
      // Get Orgo API key from environment
      const orgoApiKey = process.env.ORGO_API_KEY
      if (!orgoApiKey) {
        return NextResponse.json(
          { error: 'Orgo API key not configured' },
          { status: 500 }
        )
      }

      // Clone repositories on VM immediately
      const orgoClient = new OrgoClient(orgoApiKey)
      const vmSetup = new VMSetup(orgoClient, setupState.orgoComputerId!)

      cloneResult = await vmSetup.cloneRepositories(
        reposToClone.map(repo => ({
          name: repo.name,
          sshUrl: repo.ssh_url,
        }))
      )

      if (!cloneResult.success && cloneResult.errors) {
        console.error('Some repositories failed to clone:', cloneResult.errors)
        // Continue anyway to update vault file
      }
    } else {
      console.log('VM not yet available, repositories will be cloned when VM is ready')
    }

    // Create markdown file in vault with repository paths
    const reposContent = `# GitHub Repositories Integration

*Last updated: ${new Date().toISOString()}*
*Total repositories: ${reposToClone.length}*

## Connected Repositories

${reposToClone.map((repo, index) => {
  const repoPath = `~/repositories/${repo.name}`
  return `### ${index + 1}. ${repo.name}

- **Full Name:** ${repo.full_name}
- **Private:** ${repo.private ? 'Yes' : 'No'}
- **Path on VM:** \`${repoPath}\`
- **GitHub URL:** [${repo.html_url}](${repo.html_url})
- **SSH URL:** \`${repo.ssh_url}\`
- **Added:** ${new Date().toISOString()}
`
}).join('\n')}

## Usage

These repositories are cloned in the \`~/repositories/\` directory on the VM and can be accessed by the AI agent as data sources.
`

    await githubClient.writeFileToVault(
      setupState.vaultRepoName,
      'integrations/github/repositories.md',
      reposContent,
      'Add GitHub repositories as data sources'
    )

    // Prepare metadata with repo info including SSH URLs for later cloning
    const repoMetadata = reposToClone.map(repo => ({
      full_name: repo.full_name,
      name: repo.name,
      ssh_url: repo.ssh_url,
      html_url: repo.html_url,
      private: repo.private,
    }))

    // Update Integration record
    await prisma.integration.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: 'github',
        },
      },
      create: {
        userId: session.user.id,
        provider: 'github',
        status: hasVM ? 'connected' : 'pending',
        lastSyncedAt: new Date(),
        syncEnabled: false,
        metadata: JSON.stringify({ 
          repositories: reposToClone.map(r => r.full_name),
          paths: reposToClone.map(r => `~/repositories/${r.name}`),
          repoDetails: repoMetadata,
          pending: !hasVM, // Mark as pending if VM doesn't exist
        }),
      },
      update: {
        status: hasVM ? 'connected' : 'pending',
        lastSyncedAt: new Date(),
        metadata: JSON.stringify({ 
          repositories: reposToClone.map(r => r.full_name),
          paths: reposToClone.map(r => `~/repositories/${r.name}`),
          repoDetails: repoMetadata,
          pending: !hasVM,
        }),
      },
    })

    return NextResponse.json({ 
      success: true,
      message: hasVM 
        ? `Successfully connected ${reposToClone.length} repository(ies)`
        : `Queued ${reposToClone.length} repository(ies) for cloning when VM is ready`,
      repositories: reposToClone.map(r => r.full_name),
      cloneErrors: cloneResult?.errors,
      pending: !hasVM,
    })

  } catch (error: any) {
    console.error('GitHub connect error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to connect GitHub repositories' },
      { status: 500 }
    )
  }
}

