import axios from 'axios'
import { logger } from '@/ui/logger'
import type { AgentState, CreateSessionResponse, Metadata, Session, Machine, MachineMetadata, DaemonState } from '@/api/types'
import { ApiSessionClient } from './apiSession';
import { ApiMachineClient } from './apiMachine';
import { PushNotificationClient } from './pushNotifications';
import { configuration } from '@/configuration';
import chalk from 'chalk';
import { clearMachineId } from '@/persistence';

export class ApiClient {
  private readonly pushClient: PushNotificationClient;

  constructor() {
    this.pushClient = new PushNotificationClient()
  }

  /**
   * Create a new session or load existing one with the given tag
   */
  async getOrCreateSession(opts: { tag: string, metadata: Metadata, state: AgentState | null }): Promise<Session> {
    try {
      const response = await axios.post<CreateSessionResponse>(
        `${configuration.serverUrl}/v1/sessions`,
        {
          tag: opts.tag,
          metadata: JSON.stringify(opts.metadata),
          agentState: opts.state ? JSON.stringify(opts.state) : null
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 5000 // 5 second timeout
        }
      )

      logger.debug(`Session created/loaded: ${response.data.session.id} (tag: ${opts.tag})`)
      let raw = response.data.session;
      let session: Session = {
        id: raw.id,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        seq: raw.seq,
        metadata: typeof raw.metadata === 'string' ? JSON.parse(raw.metadata) : raw.metadata,
        metadataVersion: raw.metadataVersion,
        agentState: raw.agentState ? (typeof raw.agentState === 'string' ? JSON.parse(raw.agentState) : raw.agentState) : null,
        agentStateVersion: raw.agentStateVersion
      }
      return session;
    } catch (error) {
      logger.debug('[API] [ERROR] Failed to get or create session:', error);
      throw new Error(`Failed to get or create session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get machine by ID from the server
   * Returns the current machine state from the server with decrypted metadata and daemonState
   */
  async getMachine(machineId: string): Promise<Machine | null> {
    const response = await axios.get(`${configuration.serverUrl}/v1/machines/${machineId}`, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 2000
    });

    const raw = response.data.machine;
    if (!raw) {
      return null;
    }

    logger.debug(`[API] Machine ${machineId} fetched from server`);

    // Parse metadata and daemonState for single-user mode
    const machine: Machine = {
      id: raw.id,
      metadata: raw.metadata ? (typeof raw.metadata === 'string' ? JSON.parse(raw.metadata) : raw.metadata) : null,
      metadataVersion: raw.metadataVersion || 0,
      daemonState: raw.daemonState ? (typeof raw.daemonState === 'string' ? JSON.parse(raw.daemonState) : raw.daemonState) : null,
      daemonStateVersion: raw.daemonStateVersion || 0,
      active: raw.active,
      activeAt: raw.activeAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    };
    return machine;
  }

  /**
   * Register or update machine with the server
   * Returns the current machine state from the server with decrypted metadata and daemonState
   */
  async createMachineOrGetExistingAsIs(opts: {
    machineId: string,
    metadata: MachineMetadata,
    daemonState?: DaemonState
  }): Promise<Machine> {
    const response = await axios.post(
      `${configuration.serverUrl}/v1/machines`,
      {
        id: opts.machineId,
        metadata: JSON.stringify(opts.metadata),
        daemonState: opts.daemonState ? JSON.stringify(opts.daemonState) : undefined
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    if (response.status !== 200) {
      console.error(chalk.red(`[API] Failed to create machine: ${response.statusText}`));
      console.log(chalk.yellow(`[API] Failed to create machine: ${response.statusText}, most likely you have re-authenticated, but you still have a machine associated with the old account. Now we are trying to re-associate the machine with the new account. That is not allowed. Please run 'happy doctor clean' to clean up your happy state, and try your original command again. Please create an issue on github if this is causing you problems. We apologize for the inconvenience.`));
      process.exit(1);
    }

    const raw = response.data.machine;
    logger.debug(`[API] Machine ${opts.machineId} registered/updated with server`);

    // Return parsed machine for single-user mode
    const machine: Machine = {
      id: raw.id,
      metadata: raw.metadata ? (typeof raw.metadata === 'string' ? JSON.parse(raw.metadata) : raw.metadata) : null,
      metadataVersion: raw.metadataVersion || 0,
      daemonState: raw.daemonState ? (typeof raw.daemonState === 'string' ? JSON.parse(raw.daemonState) : raw.daemonState) : null,
      daemonStateVersion: raw.daemonStateVersion || 0,
      active: raw.active,
      activeAt: raw.activeAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    };
    return machine;
  }

  sessionSyncClient(session: Session): ApiSessionClient {
    return new ApiSessionClient(session);
  }

  machineSyncClient(machine: Machine): ApiMachineClient {
    return new ApiMachineClient(machine);
  }

  push(): PushNotificationClient {
    return this.pushClient;
  }
}
