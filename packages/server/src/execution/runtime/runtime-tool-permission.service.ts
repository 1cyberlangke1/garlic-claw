import { randomUUID } from 'node:crypto';
import type {
  RuntimeCapabilityName,
  RuntimePermissionDecision,
  RuntimePermissionReplyResult,
  RuntimePermissionRequest,
  RuntimePermissionResolution,
} from '@garlic-claw/shared';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type {
  RuntimeBackendDescriptor,
} from './runtime-command.types';
import { RuntimeHostConversationRecordService } from '../../runtime/host/runtime-host-conversation-record.service';

interface RuntimePermissionReviewInput {
  abortSignal?: AbortSignal;
  backend: RuntimeBackendDescriptor;
  conversationId?: string;
  messageId?: string;
  metadata?: RuntimePermissionRequest['metadata'];
  requiredCapabilities: RuntimeCapabilityName[];
  summary: string;
  toolName: string;
}

interface PendingRuntimePermissionRequest {
  request: RuntimePermissionRequest;
  resolve: (decision: RuntimePermissionDecision) => void;
}

type RuntimePermissionEvent =
  | {
      type: 'request';
      request: RuntimePermissionRequest;
    }
  | {
      type: 'resolved';
      messageId?: string;
      result: RuntimePermissionReplyResult;
    };

@Injectable()
export class RuntimeToolPermissionService {
  private readonly approvals = new Map<string, Set<string>>();
  private readonly pendingRequests = new Map<string, PendingRuntimePermissionRequest>();
  private readonly listeners = new Map<string, Set<(event: RuntimePermissionEvent) => void>>();

  constructor(
    @Optional()
    private readonly runtimeHostConversationRecordService?: RuntimeHostConversationRecordService,
  ) {}

  async review(input: RuntimePermissionReviewInput): Promise<void> {
    const missingCapabilities = input.requiredCapabilities.filter(
      (capability) => !input.backend.capabilities[capability],
    );
    if (missingCapabilities.length > 0) {
      throw new ForbiddenException(
        `当前 runtime 后端 ${input.backend.kind} 不支持能力: ${missingCapabilities.join(', ')}`,
      );
    }

    const deniedCapabilities = input.requiredCapabilities.filter(
      (capability) => input.backend.permissionPolicy[capability] === 'deny',
    );
    if (deniedCapabilities.length > 0) {
      throw new ForbiddenException(
        `当前 runtime 权限策略拒绝能力: ${deniedCapabilities.join(', ')}`,
      );
    }

    const capabilitiesToAsk = input.requiredCapabilities.filter((capability) => {
      if (input.backend.permissionPolicy[capability] !== 'ask') {
        return false;
      }
      if (!input.conversationId) {
        return true;
      }
      return !this.isApprovedAlways(input.conversationId, input.backend.kind, capability);
    });
    if (capabilitiesToAsk.length === 0) {
      return;
    }
    if (!input.conversationId) {
      throw new ForbiddenException('当前上下文没有 conversationId，无法完成 runtime 权限审批');
    }

    const request: RuntimePermissionRequest = {
      backendKind: input.backend.kind,
      capabilities: capabilitiesToAsk,
      conversationId: input.conversationId,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      ...(input.messageId ? { messageId: input.messageId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      summary: input.summary,
      toolName: input.toolName,
    };

    const decision = await new Promise<RuntimePermissionDecision>((resolve, reject) => {
      const abortHandler = () => {
        this.pendingRequests.delete(request.id);
        this.emit(request.conversationId, {
          type: 'resolved',
          ...(request.messageId ? { messageId: request.messageId } : {}),
          result: {
            requestId: request.id,
            resolution: 'rejected',
          },
        });
        reject(new ForbiddenException('用户已取消本次权限请求'));
      };
      if (input.abortSignal?.aborted) {
        abortHandler();
        return;
      }
      if (input.abortSignal) {
        input.abortSignal.addEventListener('abort', abortHandler, { once: true });
      }

      this.pendingRequests.set(request.id, {
        request,
        resolve: (nextDecision) => {
          if (input.abortSignal) {
            input.abortSignal.removeEventListener('abort', abortHandler);
          }
          resolve(nextDecision);
        },
      });
      this.emit(request.conversationId, {
          type: 'request',
          request,
        });
    });

    if (decision === 'reject') {
      throw new ForbiddenException('用户拒绝了本次 runtime 权限请求');
    }
    if (decision === 'always') {
      for (const capability of capabilitiesToAsk) {
        this.markApprovedAlways(request.conversationId, request.backendKind, capability);
      }
    }
  }

  listPendingRequests(conversationId: string): RuntimePermissionRequest[] {
    return Array.from(this.pendingRequests.values())
      .map((entry) => entry.request)
      .filter((entry) => entry.conversationId === conversationId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  reply(
    conversationId: string,
    requestId: string,
    decision: RuntimePermissionDecision,
  ): RuntimePermissionReplyResult {
    const pending = this.pendingRequests.get(requestId);
    if (!pending || pending.request.conversationId !== conversationId) {
      throw new NotFoundException(`Runtime permission request not found: ${requestId}`);
    }
    this.pendingRequests.delete(requestId);
    const resolution: RuntimePermissionResolution =
      decision === 'reject' ? 'rejected' : 'approved';
    const result: RuntimePermissionReplyResult = {
      requestId,
      resolution,
    };
    this.emit(conversationId, {
      type: 'resolved',
      ...(pending.request.messageId ? { messageId: pending.request.messageId } : {}),
      result,
    });
    pending.resolve(decision);
    return result;
  }

  subscribe(
    conversationId: string,
    listener: (event: RuntimePermissionEvent) => void,
  ): () => void {
    const listeners = this.listeners.get(conversationId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(conversationId, listeners);
    return () => {
      const nextListeners = this.listeners.get(conversationId);
      if (!nextListeners) {
        return;
      }
      nextListeners.delete(listener);
      if (nextListeners.size === 0) {
        this.listeners.delete(conversationId);
      }
    };
  }

  private emit(conversationId: string, event: RuntimePermissionEvent): void {
    for (const listener of this.listeners.get(conversationId) ?? []) {
      listener(event);
    }
  }

  private isApprovedAlways(
    conversationId: string,
    backendKind: RuntimePermissionRequest['backendKind'],
    capability: RuntimeCapabilityName,
  ): boolean {
    return this.readApprovalSet(conversationId)
      .has(`${backendKind}:${capability}`);
  }

  private markApprovedAlways(
    conversationId: string,
    backendKind: RuntimePermissionRequest['backendKind'],
    capability: RuntimeCapabilityName,
  ): void {
    const approvalKey = `${backendKind}:${capability}`;
    const approvals = this.readApprovalSet(conversationId);
    approvals.add(approvalKey);
    this.approvals.set(conversationId, approvals);
    this.runtimeHostConversationRecordService?.rememberRuntimePermissionApproval(
      conversationId,
      approvalKey,
    );
  }

  private readApprovalSet(conversationId: string): Set<string> {
    const existing = this.approvals.get(conversationId);
    if (existing) {
      return existing;
    }
    const approvals = new Set(
      this.runtimeHostConversationRecordService?.readRuntimePermissionApprovals(conversationId) ?? [],
    );
    this.approvals.set(conversationId, approvals);
    return approvals;
  }
}
