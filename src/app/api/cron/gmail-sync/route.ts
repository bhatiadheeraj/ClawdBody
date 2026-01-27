import { NextRequest, NextResponse } from 'next/server'

// Cron job endpoint for Gmail sync
// This route is designed to be called by Vercel Cron or similar services
// 
// To set up with Vercel Cron, add to vercel.json:
// { "crons": [{ "path": "/api/cron/gmail-sync", "schedule": "0 0 * * *" }] }
// 
// For other platforms, set up a cron job to call this endpoint daily
export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron request (Vercel adds this header)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // If CRON_SECRET is set, require authentication
    if (cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Call the sync endpoint
    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin
    const syncResponse = await fetch(`${baseUrl}/api/integrations/gmail/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cronSecret && { 'Authorization': `Bearer ${cronSecret}` }),
      },
    })

    const syncData = await syncResponse.json()

    if (!syncResponse.ok) {
      return NextResponse.json(
        { error: 'Sync failed', details: syncData },
        { status: syncResponse.status }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Gmail sync job completed',
      ...syncData,
    })

  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to run cron job' },
      { status: 500 }
    )
  }
}

