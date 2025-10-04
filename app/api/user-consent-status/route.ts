import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromCookie } from '@/lib/session'
import sql from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie()

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // 查询用户同意状态
    const consentRecord = await sql<{ consent_given: boolean; created_at: string }[]>`
      SELECT consent_given, created_at 
      FROM user_consent 
      WHERE user_id = ${userId}
    `

    return NextResponse.json({
      hasConsentRecord: consentRecord.length > 0,
      consentGiven: consentRecord.length > 0 ? consentRecord[0].consent_given : null,
      createdAt: consentRecord.length > 0 ? consentRecord[0].created_at : null
    })

  } catch (error) {
    console.error('Error fetching user consent status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
