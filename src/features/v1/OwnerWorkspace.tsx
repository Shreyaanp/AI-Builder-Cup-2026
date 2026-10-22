import type { Api, Me } from './api'
import { AppShell } from './AppShell'
import { BackHistory } from './backStack'
import { WorkspaceProvider } from './WorkspaceProvider'

/** The signed-in owner app: its own chunk, so the welcome and sign-in never wait for it. */
export default function OwnerWorkspace({ api, me }: { api: Api; me: Me }) {
  // The phone's Back button closes the owner app's sheets and dialogs first.
  return (
    <BackHistory value>
      <WorkspaceProvider api={api} me={me}>
        <AppShell />
      </WorkspaceProvider>
    </BackHistory>
  )
}
