"use server"

import { updateGroupIntervention } from "@/lib/actions"
import { redirect } from "next/navigation"

interface Group {
  id: number
  name: string
  intervene: boolean
  plan_time: string | null
  monitor_time: string | null
  evaluate_time: string | null
}

async function getGroups(): Promise<Group[]> {
  // Import sql here to avoid server component issues
  const { default: sql } = await import("@/lib/db")
  
  const groups = await sql<Group[]>`
    SELECT id, name, intervene, plan_time, monitor_time, evaluate_time
    FROM groups
    ORDER BY id
  `
  return groups
}

export default async function AdminPage() {
  const groups = await getGroups()

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Group Intervention Management</h1>
          <p className="text-gray-600 mb-8">
            Set intervention times for groups. When intervene is enabled and the time is reached, 
            NATE will automatically send intervention messages.
          </p>
          
          <div className="space-y-6">
            {groups.map((group) => (
              <GroupInterventionForm key={group.id} group={group} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupInterventionForm({ group }: { group: Group }) {
  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Group: {group.name}</h3>
      
      <form action={async (formData: FormData) => {
        "use server"
        const intervene = formData.get('intervene') === 'on'
        const planTime = formData.get('plan_time') as string
        const monitorTime = formData.get('monitor_time') as string
        const evaluateTime = formData.get('evaluate_time') as string
        
        await updateGroupIntervention(
          group.id,
          intervene,
          planTime || undefined,
          monitorTime || undefined,
          evaluateTime || undefined
        )
        
        redirect('/admin')
      }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Enable Intervention */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={`intervene_${group.id}`}
              name="intervene"
              defaultChecked={group.intervene}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor={`intervene_${group.id}`} className="text-sm font-medium text-gray-700">
              Enable Intervention
            </label>
          </div>
          
          {/* Plan Time */}
          <div>
            <label htmlFor={`plan_${group.id}`} className="block text-sm font-medium text-gray-700 mb-1">
              Plan Time
            </label>
            <input
              type="datetime-local"
              id={`plan_${group.id}`}
              name="plan_time"
              defaultValue={group.plan_time ? new Date(group.plan_time).toISOString().slice(0, 16) : ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Monitor Time */}
          <div>
            <label htmlFor={`monitor_${group.id}`} className="block text-sm font-medium text-gray-700 mb-1">
              Monitor Time
            </label>
            <input
              type="datetime-local"
              id={`monitor_${group.id}`}
              name="monitor_time"
              defaultValue={group.monitor_time ? new Date(group.monitor_time).toISOString().slice(0, 16) : ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Evaluate Time */}
          <div>
            <label htmlFor={`evaluate_${group.id}`} className="block text-sm font-medium text-gray-700 mb-1">
              Evaluate Time
            </label>
            <input
              type="datetime-local"
              id={`evaluate_${group.id}`}
              name="evaluate_time"
              defaultValue={group.evaluate_time ? new Date(group.evaluate_time).toISOString().slice(0, 16) : ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Update Settings
          </button>
        </div>
      </form>
      
      {/* Current Status */}
      <div className="mt-4 p-3 bg-white rounded border">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Current Status:</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <div>Intervention: {group.intervene ? '✅ Enabled' : '❌ Disabled'}</div>
          {group.plan_time && (
            <div>Plan: {new Date(group.plan_time).toLocaleString()}</div>
          )}
          {group.monitor_time && (
            <div>Monitor: {new Date(group.monitor_time).toLocaleString()}</div>
          )}
          {group.evaluate_time && (
            <div>Evaluate: {new Date(group.evaluate_time).toLocaleString()}</div>
          )}
        </div>
      </div>
    </div>
  )
}
