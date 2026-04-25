import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import ts from 'typescript';
import type {
  RuntimeFilesystemDiagnosticEntry,
  RuntimeFilesystemDiagnosticSeverity,
  RuntimeFilesystemFormattingResult,
} from '../runtime/runtime-filesystem-backend.types';
import type {
  RuntimeFilesystemPostWriteInput,
  RuntimeFilesystemPostWriteOutput,
  RuntimeFilesystemPostWriteProvider,
} from '../runtime/runtime-filesystem-post-write.service';

const SCRIPT_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

@Injectable()
export class ProjectWorktreePostWriteService implements RuntimeFilesystemPostWriteProvider {
  processTextFile(input: RuntimeFilesystemPostWriteInput): RuntimeFilesystemPostWriteOutput {
    const formatted = formatProjectWorktreeJson(input.path, input.content);
    const content = formatted?.content ?? input.content;
    return {
      content,
      postWrite: {
        diagnostics: readProjectWorktreeDiagnostics(input, content),
        formatting: formatted?.result ?? null,
      },
    };
  }
}

function formatProjectWorktreeJson(
  filePath: string,
  content: string,
): { content: string; result: RuntimeFilesystemFormattingResult } | null {
  if (path.extname(filePath).toLowerCase() !== '.json') {
    return null;
  }
  try {
    const formatted = `${JSON.stringify(JSON.parse(content), null, 2)}${content.endsWith('\n') ? '\n' : ''}`;
    return formatted === content ? null : {
      content: formatted,
      result: { kind: 'json-pretty', label: 'json-pretty' },
    };
  } catch {
    return null;
  }
}

function readProjectWorktreeDiagnostics(
  input: RuntimeFilesystemPostWriteInput,
  content: string,
): RuntimeFilesystemDiagnosticEntry[] {
  const extension = path.extname(input.path).toLowerCase();
  if (extension === '.json') {
    return readRuntimeDiagnostics([ts.parseConfigFileTextToJson(input.path, content).error].filter((item): item is ts.Diagnostic => Boolean(item)), input);
  }
  if (!SCRIPT_EXTENSIONS.has(extension)) {
    return [];
  }
  return readTypeScriptProjectDiagnostics(input, content) ?? readTypeScriptSyntaxDiagnostics(input.path, content, extension);
}

function readTypeScriptSyntaxDiagnostics(
  filePath: string,
  content: string,
  extension: string,
): RuntimeFilesystemDiagnosticEntry[] {
  return readRuntimeDiagnostics(ts.transpileModule(content, {
    compilerOptions: {
      allowJs: true,
      jsx: extension === '.tsx' || extension === '.jsx' ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
    fileName: filePath,
    reportDiagnostics: true,
  }).diagnostics ?? []);
}

function readTypeScriptProjectDiagnostics(
  input: RuntimeFilesystemPostWriteInput,
  content: string,
): RuntimeFilesystemDiagnosticEntry[] | null {
  const configPath = findNearestProjectConfig(input.hostPath);
  if (!configPath) {
    return null;
  }
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    return readRuntimeDiagnostics([configFile.error], input);
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath), undefined, configPath);
  if (parsed.errors.length > 0) {
    return readRuntimeDiagnostics(parsed.errors, input);
  }
  const normalizedHostPath = normalizeProjectWorktreePath(input.hostPath);
  const rootNames = parsed.fileNames.some((fileName) => normalizeProjectWorktreePath(fileName) === normalizedHostPath)
    ? parsed.fileNames
    : [...parsed.fileNames, input.hostPath];
  const compilerHost = ts.createCompilerHost(parsed.options, true);
  const getSourceFile = compilerHost.getSourceFile.bind(compilerHost);
  const readFile = compilerHost.readFile.bind(compilerHost);
  const fileExists = compilerHost.fileExists.bind(compilerHost);
  compilerHost.readFile = (fileName) => normalizeProjectWorktreePath(fileName) === normalizedHostPath ? content : readFile(fileName);
  compilerHost.fileExists = (fileName) => normalizeProjectWorktreePath(fileName) === normalizedHostPath || fileExists(fileName);
  compilerHost.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    normalizeProjectWorktreePath(fileName) === normalizedHostPath
      ? ts.createSourceFile(fileName, content, languageVersion, true)
      : getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  return selectProjectDiagnostics(readRuntimeDiagnostics(
    ts.getPreEmitDiagnostics(ts.createProgram({
      host: compilerHost,
      options: parsed.options,
      projectReferences: parsed.projectReferences,
      rootNames,
    })),
    input,
  ), input.path);
}

function findNearestProjectConfig(hostPath: string): string | null {
  for (let current = path.dirname(hostPath); ; current = path.dirname(current)) {
    for (const fileName of ['tsconfig.json', 'jsconfig.json']) {
      const candidate = path.join(current, fileName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
  }
}

function selectProjectDiagnostics(
  diagnostics: RuntimeFilesystemDiagnosticEntry[],
  currentPath: string,
): RuntimeFilesystemDiagnosticEntry[] {
  const current = diagnostics.filter((item) => item.path === currentPath);
  const related = new Map<string, RuntimeFilesystemDiagnosticEntry[]>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.path === currentPath) {
      continue;
    }
    related.set(diagnostic.path, [...(related.get(diagnostic.path) ?? []), diagnostic]);
  }
  return [
    ...current,
    ...[...related.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .slice(0, 5)
      .flatMap(([, entries]) => entries),
  ];
}

function readRuntimeDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  input?: RuntimeFilesystemPostWriteInput,
): RuntimeFilesystemDiagnosticEntry[] {
  return diagnostics.map((diagnostic) => {
    const file = diagnostic.file;
    const position = file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0) ?? { character: 0, line: 0 };
    return {
      ...(diagnostic.code ? { code: String(diagnostic.code) } : {}),
      column: position.character + 1,
      line: position.line + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      path: normalizeRuntimeDiagnosticPath(file?.fileName ?? 'unknown', input),
      severity: readRuntimeDiagnosticSeverity(diagnostic.category),
      source: diagnostic.source ?? 'typescript',
    };
  });
}

function normalizeRuntimeDiagnosticPath(
  diagnosticPath: string,
  input?: RuntimeFilesystemPostWriteInput,
): string {
  if (!input || diagnosticPath === 'unknown') {
    return diagnosticPath;
  }
  const relativePath = path.relative(path.resolve(input.sessionRoot), path.resolve(diagnosticPath));
  if (relativePath.length === 0) {
    return input.visibleRoot;
  }
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return diagnosticPath;
  }
  const normalized = relativePath.replace(/\\/g, '/');
  return input.visibleRoot === '/' ? `/${normalized}` : `${input.visibleRoot}/${normalized}`;
}

function normalizeProjectWorktreePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function readRuntimeDiagnosticSeverity(category: ts.DiagnosticCategory): RuntimeFilesystemDiagnosticSeverity {
  switch (category) {
    case ts.DiagnosticCategory.Warning:
      return 'warning';
    case ts.DiagnosticCategory.Suggestion:
      return 'hint';
    case ts.DiagnosticCategory.Message:
      return 'info';
    default:
      return 'error';
  }
}
