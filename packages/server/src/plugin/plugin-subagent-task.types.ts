export interface PersistedPluginSubagentTaskRecord {
  id: string;
  pluginId: string;
  pluginDisplayName: string | null;
  runtimeKind: string;
  userId: string | null;
  conversationId: string | null;
  status: string;
  requestJson: string;
  contextJson: string;
  resultJson: string | null;
  error: string | null;
  providerId: string | null;
  modelId: string | null;
  writeBackTargetJson: string | null;
  writeBackStatus: string;
  writeBackError: string | null;
  writeBackMessageId: string | null;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
