import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { userId, consentGiven } = await request.json()

    if (!userId || typeof consentGiven !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      )
    }

    // 检查用户是否存在
    const userExists = await sql<{ id: number }[]>`
      SELECT id FROM users WHERE id = ${userId}
    `

    if (userExists.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // 插入或更新用户同意状态
    await sql`
      INSERT INTO user_consent (user_id, consent_given, created_at, updated_at)
      VALUES (${userId}, ${consentGiven}, NOW(), NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        consent_given = ${consentGiven},
        updated_at = NOW()
    `

    return NextResponse.json({ 
      success: true, 
      message: 'Consent status saved successfully' 
    })

  } catch (error) {
    console.error('Error saving user consent:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // 查询用户同意状态
    const consentRecord = await sql<{ consent_given: boolean; created_at: string }[]>`
      SELECT consent_given, created_at 
      FROM user_consent 
      WHERE user_id = ${parseInt(userId)}
    `

    return NextResponse.json({
      hasConsentRecord: consentRecord.length > 0,
      consentGiven: consentRecord.length > 0 ? consentRecord[0].consent_given : null,
      createdAt: consentRecord.length > 0 ? consentRecord[0].created_at : null
    })

  } catch (error) {
    console.error('Error fetching user consent:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
