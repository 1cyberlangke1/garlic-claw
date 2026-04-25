import { randomUUID } from 'node:crypto';
import type { RuntimeOperationName, RuntimePermissionDecision, RuntimePermissionReplyResult, RuntimePermissionRequest } from '@garlic-claw/shared';
import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { RuntimeBackendDescriptor } from './runtime-command.types';
import { expandRuntimeOperationsToCapabilities } from './runtime-operation-policy';
import { RuntimeHostConversationRecordService } from '../../runtime/host/runtime-host-conversation-record.service';

interface RuntimePermissionReviewInput {
  abortSignal?: AbortSignal;
  backend: RuntimeBackendDescriptor;
  conversationId?: string;
  messageId?: string;
  metadata?: RuntimePermissionRequest['metadata'];
  requiredOperations: RuntimeOperationName[];
  summary: string;
  toolName: string;
}

interface PendingRuntimePermissionRequest { request: RuntimePermissionRequest; resolve: (decision: RuntimePermissionDecision) => void; }
type RuntimePermissionEvent = { type: 'request'; request: RuntimePermissionRequest } | { type: 'resolved'; messageId?: string; result: RuntimePermissionReplyResult };
type RuntimeApprovalMode = 'review' | 'yolo';

@Injectable()
export class RuntimeToolPermissionService {
  private readonly approvals = new Map<string, Set<string>>();
  private readonly pendingRequests = new Map<string, PendingRuntimePermissionRequest>();
  private readonly listeners = new Map<string, Set<(event: RuntimePermissionEvent) => void>>();

  constructor(@Optional() private readonly runtimeHostConversationRecordService?: RuntimeHostConversationRecordService) {}

  async review(input: RuntimePermissionReviewInput): Promise<void> {
    const requiredCapabilities = expandRuntimeOperationsToCapabilities(input.requiredOperations);
    const unsupported = requiredCapabilities.filter((capability) => !input.backend.capabilities[capability]);
    if (unsupported.length > 0) {throw new ForbiddenException(`当前 runtime 后端 ${input.backend.kind} 不支持能力: ${unsupported.join(', ')}`);}
    const denied = requiredCapabilities.filter((capability) => input.backend.permissionPolicy[capability] === 'deny');
    if (denied.length > 0) {throw new ForbiddenException(`当前 runtime 权限策略拒绝能力: ${denied.join(', ')}`);}
    if (readRuntimeApprovalMode() === 'yolo') {return;}

    const operations = input.requiredOperations.filter((operation) => {
      const asksCapability = expandRuntimeOperationsToCapabilities([operation]).some((capability) => input.backend.permissionPolicy[capability] === 'ask');
      return asksCapability && (!input.conversationId || !this.readApprovalSet(input.conversationId).has(`${input.backend.kind}:${operation}`));
    });
    if (operations.length === 0) {return;}
    if (!input.conversationId) {throw new ForbiddenException('当前上下文没有 conversationId，无法完成 runtime 权限审批');}

    const request: RuntimePermissionRequest = {
      backendKind: input.backend.kind,
      conversationId: input.conversationId,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      operations,
      summary: input.summary,
      toolName: input.toolName,
      ...(input.messageId ? { messageId: input.messageId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    const decision = await this.waitForDecision(request, input.abortSignal);
    if (decision === 'reject') {throw new ForbiddenException('用户拒绝了本次 runtime 权限请求');}
    if (decision === 'always') {for (const operation of operations) {this.markApprovedAlways(request.conversationId, request.backendKind, operation);}}
  }

  listPendingRequests(conversationId: string): RuntimePermissionRequest[] {
    return [...this.pendingRequests.values()].map((entry) => entry.request).filter((entry) => entry.conversationId === conversationId).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  reply(conversationId: string, requestId: string, decision: RuntimePermissionDecision): RuntimePermissionReplyResult {
    const pending = this.pendingRequests.get(requestId);
    if (!pending || pending.request.conversationId !== conversationId) {throw new NotFoundException(`Runtime permission request not found: ${requestId}`);}
    this.pendingRequests.delete(requestId);
    const result: RuntimePermissionReplyResult = { requestId, resolution: decision === 'reject' ? 'rejected' : 'approved' };
    this.emit(conversationId, { type: 'resolved', ...(pending.request.messageId ? { messageId: pending.request.messageId } : {}), result });
    pending.resolve(decision);
    return result;
  }

  subscribe(conversationId: string, listener: (event: RuntimePermissionEvent) => void): () => void {
    const listeners = this.listeners.get(conversationId) ?? new Set<(event: RuntimePermissionEvent) => void>();
    listeners.add(listener);
    this.listeners.set(conversationId, listeners);
    return () => {
      const scopedListeners = this.listeners.get(conversationId);
      if (!scopedListeners) {return;}
      scopedListeners.delete(listener);
      if (scopedListeners.size === 0) {this.listeners.delete(conversationId);}
    };
  }

  private async waitForDecision(request: RuntimePermissionRequest, abortSignal?: AbortSignal): Promise<RuntimePermissionDecision> {
    return new Promise<RuntimePermissionDecision>((resolve, reject) => {
      const rejectByAbort = () => {
        this.pendingRequests.delete(request.id);
        this.emit(request.conversationId, { type: 'resolved', ...(request.messageId ? { messageId: request.messageId } : {}), result: { requestId: request.id, resolution: 'rejected' } });
        reject(new ForbiddenException('用户已取消本次权限请求'));
      };
      if (abortSignal?.aborted) {return rejectByAbort();}
      abortSignal?.addEventListener('abort', rejectByAbort, { once: true });
      this.pendingRequests.set(request.id, { request, resolve: (decision) => { abortSignal?.removeEventListener('abort', rejectByAbort); resolve(decision); } });
      this.emit(request.conversationId, { type: 'request', request });
    });
  }

  private emit(conversationId: string, event: RuntimePermissionEvent): void { for (const listener of this.listeners.get(conversationId) ?? []) {listener(event);} }

  private markApprovedAlways(conversationId: string, backendKind: RuntimePermissionRequest['backendKind'], operation: RuntimeOperationName): void {
    const approvalKey = `${backendKind}:${operation}`;
    const approvals = this.readApprovalSet(conversationId);
    approvals.add(approvalKey);
    this.approvals.set(conversationId, approvals);
    this.runtimeHostConversationRecordService?.rememberRuntimePermissionApproval(conversationId, approvalKey);
  }

  private readApprovalSet(conversationId: string): Set<string> {
    let approvals = this.approvals.get(conversationId);
    if (!approvals) {
      approvals = new Set(this.runtimeHostConversationRecordService?.readRuntimePermissionApprovals(conversationId) ?? []);
      this.approvals.set(conversationId, approvals);
    }
    return approvals;
  }
}

function readRuntimeApprovalMode(): RuntimeApprovalMode {
  const configuredMode = process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE?.trim().toLowerCase();
  if (!configuredMode || configuredMode === 'review') {return 'review';}
  if (configuredMode === 'yolo') {return 'yolo';}
  throw new ForbiddenException('GARLIC_CLAW_RUNTIME_APPROVAL_MODE 只能是 review / yolo');
}
