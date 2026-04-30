import type { ConversationTodoItem, PluginParamSchema } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import { RuntimeHostConversationTodoService } from '../../runtime/host/runtime-host-conversation-todo.service';

export interface TodoToolResult {
  sessionId: string;
  pendingCount: number;
  todos: ConversationTodoItem[];
}

const TODO_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  todos: {
    description: '会话待办的完整列表。每项都应包含 content、status、priority。',
    required: true,
    type: 'array',
  },
};

@Injectable()
export class TodoToolService {
  constructor(private readonly runtimeHostConversationTodoService: RuntimeHostConversationTodoService) {}

  getToolName(): string {
    return 'todowrite';
  }

  buildToolDescription(): string {
    return [
      '全量更新当前 session 的 todo 列表。',
      '',
      '输入必须是完整待办数组，而不是增量 patch。',
      '每项都应包含：',
      '- content: 简短任务描述',
      '- status: pending | in_progress | completed | cancelled',
      '- priority: high | medium | low',
      '待办会独立持久化到当前 session，不混进普通消息正文。',
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return TODO_TOOL_PARAMETERS;
  }

  updateSessionTodo(input: {
    sessionId?: string;
    todos: ConversationTodoItem[];
    userId?: string;
  }): TodoToolResult {
    if (!input.sessionId) {
      throw new BadRequestException('todowrite 工具只能在 session 上下文中使用');
    }
    const normalizedTodos = normalizeTodoItems(input.todos);
    this.runtimeHostConversationTodoService.replaceSessionTodo(
      input.sessionId,
      normalizedTodos,
      input.userId,
    );
    return {
      sessionId: input.sessionId,
      pendingCount: normalizedTodos.filter((item) => item.status !== 'completed' && item.status !== 'cancelled').length,
      todos: normalizedTodos,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({
    type: 'text',
    value: [
      '<todo_result>',
      `<session_id>${(output as TodoToolResult).sessionId}</session_id>`,
      `<pending_count>${(output as TodoToolResult).pendingCount}</pending_count>`,
      '<todos>',
      ...(output as TodoToolResult).todos.map((item, index) => `${index + 1}. [${item.status}] (${item.priority}) ${item.content}`),
      '</todos>',
      '</todo_result>',
    ].join('\n'),
  });
}

function normalizeTodoItems(items: ConversationTodoItem[]): ConversationTodoItem[] {
  return items.map((item, index) => {
    const content = item.content?.trim();
    if (!content) {
      throw new BadRequestException(`todos[${index}].content 不能为空`);
    }
    if (!isTodoStatus(item.status)) {
      throw new BadRequestException(`todos[${index}].status 不合法`);
    }
    if (!isTodoPriority(item.priority)) {
      throw new BadRequestException(`todos[${index}].priority 不合法`);
    }
    return {
      content,
      priority: item.priority,
      status: item.status,
    };
  });
}

function isTodoStatus(value: string): value is ConversationTodoItem['status'] {
  return value === 'pending' || value === 'in_progress' || value === 'completed' || value === 'cancelled';
}

function isTodoPriority(value: string): value is ConversationTodoItem['priority'] {
  return value === 'high' || value === 'medium' || value === 'low';
}
