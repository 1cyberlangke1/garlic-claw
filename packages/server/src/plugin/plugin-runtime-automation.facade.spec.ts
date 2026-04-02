import { AutomationService } from '../automation/automation.service';
import { PluginRuntimeAutomationFacade } from './plugin-runtime-automation.facade';

describe('PluginRuntimeAutomationFacade', () => {
  const cronService = {
    registerCron: jest.fn(),
    listCronJobs: jest.fn(),
    deleteCron: jest.fn(),
  };

  const automationService = {
    create: jest.fn(),
    findAllByUser: jest.fn(),
    emitEvent: jest.fn(),
    toggle: jest.fn(),
    executeAutomation: jest.fn(),
  };

  const moduleRef = {
    get: jest.fn(),
  };

  let service: PluginRuntimeAutomationFacade;

  beforeEach(() => {
    jest.clearAllMocks();
    cronService.registerCron.mockResolvedValue({
      id: 'cron-1',
      name: 'demo',
      cron: '*/5 * * * *',
      description: '示例任务',
      enabled: true,
    });
    cronService.listCronJobs.mockResolvedValue([]);
    cronService.deleteCron.mockResolvedValue(true);
    automationService.create.mockResolvedValue({
      id: 'automation-1',
      name: '示例自动化',
    });
    automationService.findAllByUser.mockResolvedValue([]);
    automationService.emitEvent.mockResolvedValue({
      handled: true,
    });
    automationService.toggle.mockResolvedValue({
      id: 'automation-1',
      enabled: true,
    });
    automationService.executeAutomation.mockResolvedValue({
      executionId: 'execution-1',
    });
    moduleRef.get.mockImplementation((token: unknown) => {
      if (token === AutomationService) {
        return automationService;
      }

      return null;
    });
    service = new PluginRuntimeAutomationFacade(
      cronService as never,
      moduleRef as never,
    );
  });

  it('dispatches automation.create to the automation service', async () => {
    await expect(service.call({
      pluginId: 'builtin.automation-recorder',
      context: {
        source: 'plugin',
        userId: 'user-1',
      },
      method: 'automation.create',
      params: {
        name: '示例自动化',
        trigger: {
          type: 'event',
          event: 'conversation.created',
        },
        actions: [
          {
            type: 'ai_message',
            message: '记录一条消息',
            target: {
              type: 'conversation',
              id: 'conversation-1',
            },
          },
        ],
      },
    })).resolves.toEqual({
      handled: true,
      value: {
        id: 'automation-1',
        name: '示例自动化',
      },
    });

    expect(automationService.create).toHaveBeenCalledWith(
      'user-1',
      '示例自动化',
      {
        type: 'event',
        event: 'conversation.created',
      },
      [
      {
        type: 'ai_message',
        message: '记录一条消息',
        target: {
          type: 'conversation',
          id: 'conversation-1',
        },
      },
    ],
  );
  });

  it('dispatches cron.register to the cron service', async () => {
    await expect(service.call({
      pluginId: 'builtin.automation-recorder',
      context: {
        source: 'plugin',
      },
      method: 'cron.register',
      params: {
        name: 'demo',
        cron: '*/5 * * * *',
        description: '示例任务',
        enabled: true,
      },
    })).resolves.toEqual({
      handled: true,
      value: {
        id: 'cron-1',
        name: 'demo',
        cron: '*/5 * * * *',
        description: '示例任务',
        enabled: true,
      },
    });

    expect(cronService.registerCron).toHaveBeenCalledWith(
      'builtin.automation-recorder',
      {
        name: 'demo',
        cron: '*/5 * * * *',
        description: '示例任务',
        enabled: true,
      },
    );
  });

  it('returns unhandled for non automation host methods', async () => {
    await expect(service.call({
      pluginId: 'builtin.automation-recorder',
      context: {
        source: 'plugin',
      },
      method: 'message.send',
      params: {},
    })).resolves.toEqual({
      handled: false,
    });
  });
});
