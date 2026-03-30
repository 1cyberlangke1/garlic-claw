CREATE TABLE "plugin_subagent_tasks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "plugin_id" TEXT NOT NULL,
  "plugin_display_name" TEXT,
  "runtime_kind" TEXT NOT NULL,
  "user_id" TEXT,
  "conversation_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "request_json" TEXT NOT NULL,
  "context_json" TEXT NOT NULL,
  "result_json" TEXT,
  "error" TEXT,
  "provider_id" TEXT,
  "model_id" TEXT,
  "write_back_target_json" TEXT,
  "write_back_status" TEXT NOT NULL DEFAULT 'skipped',
  "write_back_error" TEXT,
  "write_back_message_id" TEXT,
  "requested_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" DATETIME,
  "finished_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE INDEX "plugin_subagent_tasks_status_requested_at_idx"
ON "plugin_subagent_tasks"("status", "requested_at");

CREATE INDEX "plugin_subagent_tasks_plugin_id_requested_at_idx"
ON "plugin_subagent_tasks"("plugin_id", "requested_at");
