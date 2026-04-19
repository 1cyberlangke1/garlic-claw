export class PluginChatRuntimeFacade {
  constructor(moduleRef) {
    this.moduleRef = moduleRef;
  }

  getAiProvider() {
    return this.moduleRef.get(AiProviderService, { strict: false });
  }

  getSkillTool() {
    return this.moduleRef.get(SkillToolService, { strict: false });
  }

  getToolRegistry() {
    return this.moduleRef.get(ToolRegistryService, { strict: false });
  }
}
