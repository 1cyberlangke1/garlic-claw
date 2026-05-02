import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AiManagementService } from './ai-management.service';
import { AiProviderSettingsService } from './ai-provider-settings.service';
import { ContextGovernanceService } from '../conversation/context-governance.service';
import { RuntimeToolsSettingsService } from '../execution/runtime/runtime-tools-settings.service';
import { SubagentSettingsService } from '../execution/subagent/subagent-settings.service';
import type { JsonObject } from '@garlic-claw/shared';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiManagementService: AiManagementService,
    private readonly aiProviderSettingsService: AiProviderSettingsService,
    private readonly contextGovernanceService: ContextGovernanceService,
    private readonly runtimeToolsSettingsService: RuntimeToolsSettingsService,
    private readonly subagentSettingsService: SubagentSettingsService,
  ) {}

  @Get('provider-catalog')
  listProviderCatalog() {
    return this.aiManagementService.listProviderCatalog();
  }

  @Get('providers')
  listProviders() {
    return this.aiManagementService.listProviders();
  }

  @Get('default-selection')
  getDefaultSelection() {
    return this.aiManagementService.getDefaultProviderSelection();
  }

  @Put('default-selection')
  setDefaultSelection(@Body() dto: { providerId: string; modelId: string }) {
    return this.aiManagementService.setDefaultProviderSelection(dto.providerId, dto.modelId);
  }

  @Get('providers/:providerId')
  getProvider(@Param('providerId') providerId: string) {
    return this.aiManagementService.getProvider(providerId);
  }

  @Put('providers/:providerId')
  upsertProvider(@Param('providerId') providerId: string, @Body() dto: Record<string, unknown>) {
    return this.aiManagementService.upsertProvider(providerId, dto as never);
  }

  @Delete('providers/:providerId')
  deleteProvider(@Param('providerId') providerId: string) {
    this.aiManagementService.deleteProvider(providerId);
    return { success: true };
  }

  @Get('providers/:providerId/models')
  listModels(@Param('providerId') providerId: string) {
    return this.aiManagementService.listModels(providerId);
  }

  @Post('providers/:providerId/discover-models')
  discoverModels(@Param('providerId') providerId: string) {
    return this.aiManagementService.discoverModels(providerId);
  }

  @Post('providers/:providerId/models/:modelId')
  upsertModel(@Param('providerId') providerId: string, @Param('modelId') modelId: string, @Body() dto: Record<string, unknown>) {
    return this.aiManagementService.upsertModel(providerId, modelId, dto as never);
  }

  @Delete('providers/:providerId/models/:modelId')
  deleteModel(@Param('providerId') providerId: string, @Param('modelId') modelId: string) {
    this.aiManagementService.deleteModel(providerId, modelId);
    return { success: true };
  }

  @Put('providers/:providerId/default-model')
  setDefaultModel(@Param('providerId') providerId: string, @Body() dto: { modelId: string }) {
    return this.aiManagementService.setDefaultModel(providerId, dto.modelId);
  }

  @Put('providers/:providerId/models/:modelId/capabilities')
  updateModelCapabilities(@Param('providerId') providerId: string, @Param('modelId') modelId: string, @Body() dto: Record<string, unknown>) {
    return this.aiManagementService.updateModelCapabilities(providerId, modelId, dto as never);
  }

  @Post('providers/:providerId/test-connection')
  testConnection(@Param('providerId') providerId: string, @Body() dto: { modelId?: string }) {
    return this.aiManagementService.testConnection(providerId, dto.modelId);
  }

  @Get('vision-fallback')
  getVisionFallbackConfig() {
    return this.aiProviderSettingsService.getVisionFallbackConfig();
  }

  @Put('vision-fallback')
  updateVisionFallbackConfig(@Body() dto: Record<string, unknown>) {
    return this.aiProviderSettingsService.updateVisionFallbackConfig(dto as never);
  }

  @Get('host-model-routing')
  getHostModelRoutingConfig() {
    return this.aiProviderSettingsService.getHostModelRoutingConfig();
  }

  @Put('host-model-routing')
  updateHostModelRoutingConfig(@Body() dto: Record<string, unknown>) {
    return this.aiProviderSettingsService.updateHostModelRoutingConfig(dto as never);
  }

  @Get('runtime-tools-config')
  getRuntimeToolsConfig() {
    return this.runtimeToolsSettingsService.getConfigSnapshot();
  }

  @Put('runtime-tools-config')
  updateRuntimeToolsConfig(@Body() dto: { values: JsonObject }) {
    return this.runtimeToolsSettingsService.updateConfig(dto.values);
  }

  @Get('subagent-config')
  getSubagentConfig() {
    return this.subagentSettingsService.getConfigSnapshot();
  }

  @Put('subagent-config')
  updateSubagentConfig(@Body() dto: { values: JsonObject }) {
    return this.subagentSettingsService.updateConfig(dto.values);
  }

  @Get('context-governance-config')
  getContextGovernanceConfig() {
    return this.contextGovernanceService.getConfigSnapshot();
  }

  @Put('context-governance-config')
  updateContextGovernanceConfig(@Body() dto: { values: JsonObject }) {
    return this.contextGovernanceService.updateConfig(dto.values);
  }
}
